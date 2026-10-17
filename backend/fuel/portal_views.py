import csv
from datetime import timedelta
from decimal import Decimal

from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db.models import Count, Q, Sum
from django.http import HttpResponse, HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from .models import FuelRequest, Pump, Truck, User


def get_admin_pump(user):
    """Returns the pump managed by this admin, or the first active pump for superadmin."""
    if not user.is_authenticated:
        return None
    pump = Pump.objects.filter(pump_admin=user).first()
    if not pump and user.pump:
        pump = user.pump
    if not pump and (user.role == User.Role.ADMIN or user.is_superuser):
        pump = Pump.objects.filter(is_active=True).first()
    return pump


def admin_required(view_func):
    """Decorator to require login and PUMP_ADMIN or ADMIN role."""
    def _wrapped_view(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect("portal-login")
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            messages.error(request, "Access denied. Only Pump Admins and System Admins can access this portal.")
            return redirect("portal-login")
        return view_func(request, *args, **kwargs)
    return _wrapped_view


def portal_set_language(request, lang):
    """Switch language between en, hi, mr and save preference."""
    if lang in ["en", "hi", "mr"]:
        request.session["django_language"] = lang
        if request.user.is_authenticated:
            request.user.language = lang
            request.user.save(update_fields=["language"])
    next_url = request.GET.get("next") or request.META.get("HTTP_REFERER") or "/portal/dashboard/"
    return redirect(next_url)


# ============================================================
# AUTHENTICATION VIEWS
# ============================================================

def portal_login(request):
    if request.user.is_authenticated and request.user.role in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
        return redirect("portal-dashboard")

    if request.method == "POST":
        identifier = request.POST.get("identifier", "").strip()
        password = request.POST.get("password", "").strip()

        if not identifier or not password:
            messages.error(request, "Please enter your Username or Mobile Number, and Password.")
            return render(request, "portal/login.html", {"identifier": identifier})

        # Match user by username or mobile_number
        user_candidate = User.objects.filter(
            Q(username__iexact=identifier) | Q(mobile_number=identifier)
        ).first()

        if not user_candidate:
            messages.error(request, "Invalid credentials. Account not found.")
            return render(request, "portal/login.html", {"identifier": identifier})

        # Verify password
        user = authenticate(request, username=user_candidate.username, password=password)
        if not user:
            # Fallback check using check_password in case username differs
            if user_candidate.check_password(password):
                user = user_candidate
            else:
                messages.error(request, "Incorrect password. Please try again.")
                return render(request, "portal/login.html", {"identifier": identifier})

        if not user.is_active:
            messages.error(request, "Your account is currently inactive. Please contact support.")
            return render(request, "portal/login.html", {"identifier": identifier})

        if user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            messages.error(
                request,
                f"Access denied: Role '{user.get_role_display()}' cannot access the Pump Admin Portal. Please use the mobile app."
            )
            return render(request, "portal/login.html", {"identifier": identifier})

        login(request, user)
        return redirect("portal-dashboard")

    return render(request, "portal/login.html")


def portal_logout(request):
    logout(request)
    messages.success(request, "You have been safely signed out.")
    return redirect("portal-login")


# ============================================================
# DASHBOARD OVERVIEW
# ============================================================

@admin_required
def portal_dashboard(request):
    pump = get_admin_pump(request.user)
    
    # Base querysets scoped to this pump
    req_qs = FuelRequest.objects.all()
    if pump and request.user.role != User.Role.ADMIN:
        req_qs = req_qs.filter(pump=pump)

    # Core Metrics
    total_requests = req_qs.count()
    completed_requests = req_qs.filter(status=FuelRequest.Status.COMPLETED).count()
    approved_requests = req_qs.filter(status=FuelRequest.Status.APPROVED).count()
    pending_requests = req_qs.filter(status=FuelRequest.Status.PENDING).count()
    rejected_requests = req_qs.filter(status=FuelRequest.Status.REJECTED).count()

    # Liters Aggregation
    liters_data = req_qs.filter(status__in=[FuelRequest.Status.APPROVED, FuelRequest.Status.COMPLETED]).aggregate(
        total_liters=Sum("approved_liters"),
        diesel_liters=Sum("approved_liters", filter=Q(fuel_type=FuelRequest.FuelType.DIESEL)),
        petrol_liters=Sum("approved_liters", filter=Q(fuel_type=FuelRequest.FuelType.PETROL)),
    )
    total_liters = liters_data["total_liters"] or Decimal("0.00")
    diesel_liters = liters_data["diesel_liters"] or Decimal("0.00")
    petrol_liters = liters_data["petrol_liters"] or Decimal("0.00")

    # Operators assigned to this pump
    if pump:
        operators = User.objects.filter(
            Q(pump_assignment__pump=pump) | Q(pump=pump) | Q(created_by=request.user)
        ).filter(role=User.Role.OPERATOR).distinct()
    else:
        operators = User.objects.filter(role=User.Role.OPERATOR)
    total_operators = operators.count()

    # Truck owners associated
    if pump:
        customers = User.objects.filter(
            Q(trucks_owned__fuel_requests__pump=pump) | Q(pump=pump) | Q(created_by=request.user)
        ).filter(role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]).distinct()
        trucks_count = Truck.objects.filter(
            Q(fuel_requests__pump=pump) | Q(customer__in=customers)
        ).distinct().count()
    else:
        customers = User.objects.filter(role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER])
        trucks_count = Truck.objects.count()
    total_customers = customers.count()

    # Recent 10 Transactions
    recent_requests = req_qs.select_related("truck", "driver", "operator", "pump").order_by("-created_at")[:10]

    # Quick Top 5 Operators by volume
    top_operators = operators.annotate(
        req_count=Count("handled_fuel_requests", filter=Q(handled_fuel_requests__in=req_qs)),
        dispensed_liters=Sum("handled_fuel_requests__approved_liters", filter=Q(handled_fuel_requests__in=req_qs))
    ).order_by("-dispensed_liters")[:5]

    context = {
        "pump": pump,
        "total_requests": total_requests,
        "completed_requests": completed_requests,
        "approved_requests": approved_requests,
        "pending_requests": pending_requests,
        "rejected_requests": rejected_requests,
        "total_liters": total_liters,
        "diesel_liters": diesel_liters,
        "petrol_liters": petrol_liters,
        "total_operators": total_operators,
        "total_customers": total_customers,
        "trucks_count": trucks_count,
        "recent_requests": recent_requests,
        "top_operators": top_operators,
        "active_nav": "dashboard",
    }
    return render(request, "portal/dashboard.html", context)


# ============================================================
# OPERATOR ANALYTICAL REPORTS
# ============================================================

@admin_required
def portal_operator_reports(request):
    pump = get_admin_pump(request.user)
    search_query = request.GET.get("q", "").strip()

    if pump:
        operators = User.objects.filter(
            Q(pump_assignment__pump=pump) | Q(pump=pump) | Q(created_by=request.user)
        ).filter(role=User.Role.OPERATOR).distinct()
    else:
        operators = User.objects.filter(role=User.Role.OPERATOR)

    if search_query:
        operators = operators.filter(
            Q(first_name__icontains=search_query) |
            Q(username__icontains=search_query) |
            Q(mobile_number__icontains=search_query)
        )

    # Annotate stats per operator
    operator_list = []
    grand_liters = Decimal("0.00")
    grand_requests = 0

    for op in operators:
        op_requests = FuelRequest.objects.filter(operator=op)
        if pump and request.user.role != User.Role.ADMIN:
            op_requests = op_requests.filter(pump=pump)

        agg = op_requests.filter(status__in=[FuelRequest.Status.APPROVED, FuelRequest.Status.COMPLETED]).aggregate(
            total_liters=Sum("approved_liters"),
            diesel_liters=Sum("approved_liters", filter=Q(fuel_type=FuelRequest.FuelType.DIESEL)),
            petrol_liters=Sum("approved_liters", filter=Q(fuel_type=FuelRequest.FuelType.PETROL)),
        )
        total_l = agg["total_liters"] or Decimal("0.00")
        diesel_l = agg["diesel_liters"] or Decimal("0.00")
        petrol_l = agg["petrol_liters"] or Decimal("0.00")
        total_reqs = op_requests.count()
        completed_reqs = op_requests.filter(status__in=[FuelRequest.Status.APPROVED, FuelRequest.Status.COMPLETED]).count()
        last_req = op_requests.order_by("-created_at").first()

        grand_liters += total_l
        grand_requests += total_reqs

        operator_list.append({
            "operator": op,
            "total_liters": total_l,
            "diesel_liters": diesel_l,
            "petrol_liters": petrol_l,
            "total_requests": total_reqs,
            "completed_requests": completed_reqs,
            "last_active": last_req.created_at if last_req else None,
        })

    # Sort by total liters descending
    operator_list.sort(key=lambda x: x["total_liters"], reverse=True)

    context = {
        "pump": pump,
        "operator_list": operator_list,
        "search_query": search_query,
        "total_operators_count": len(operator_list),
        "grand_liters": grand_liters,
        "grand_requests": grand_requests,
        "active_nav": "operators",
    }
    return render(request, "portal/operator_reports.html", context)


@admin_required
def portal_operator_detail(request, operator_id):
    pump = get_admin_pump(request.user)
    operator = get_object_or_404(User, id=operator_id, role=User.Role.OPERATOR)

    # Filter parameters
    days = request.GET.get("days", "all")
    fuel_filter = request.GET.get("fuel_type", "all")

    requests_qs = FuelRequest.objects.filter(operator=operator).select_related("truck", "driver", "pump")
    if pump and request.user.role != User.Role.ADMIN:
        requests_qs = requests_qs.filter(pump=pump)

    # Date range filtering
    now = timezone.now()
    if days == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        requests_qs = requests_qs.filter(created_at__gte=start_date)
    elif days == "7":
        start_date = now - timedelta(days=7)
        requests_qs = requests_qs.filter(created_at__gte=start_date)
    elif days == "30":
        start_date = now - timedelta(days=30)
        requests_qs = requests_qs.filter(created_at__gte=start_date)

    if fuel_filter in ["DIESEL", "PETROL"]:
        requests_qs = requests_qs.filter(fuel_type=fuel_filter)

    # Performance Analytics for this operator
    total_handled = requests_qs.count()
    completed_count = requests_qs.filter(status__in=[FuelRequest.Status.APPROVED, FuelRequest.Status.COMPLETED]).count()
    rejected_count = requests_qs.filter(status=FuelRequest.Status.REJECTED).count()

    liters_agg = requests_qs.filter(status__in=[FuelRequest.Status.APPROVED, FuelRequest.Status.COMPLETED]).aggregate(
        total_liters=Sum("approved_liters"),
        diesel_liters=Sum("approved_liters", filter=Q(fuel_type=FuelRequest.FuelType.DIESEL)),
        petrol_liters=Sum("approved_liters", filter=Q(fuel_type=FuelRequest.FuelType.PETROL)),
    )
    total_liters = liters_agg["total_liters"] or Decimal("0.00")
    diesel_liters = liters_agg["diesel_liters"] or Decimal("0.00")
    petrol_liters = liters_agg["petrol_liters"] or Decimal("0.00")

    avg_liters = (total_liters / completed_count) if completed_count > 0 else Decimal("0.00")
    fulfillment_rate = (completed_count / total_handled * 100) if total_handled > 0 else 0

    # Paginate requests
    requests_qs = requests_qs.order_by("-created_at")
    paginator = Paginator(requests_qs, 20)
    page_number = request.GET.get("page", 1)
    page_obj = paginator.get_page(page_number)

    context = {
        "pump": pump,
        "operator": operator,
        "days": days,
        "fuel_filter": fuel_filter,
        "total_handled": total_handled,
        "completed_count": completed_count,
        "rejected_count": rejected_count,
        "total_liters": total_liters,
        "diesel_liters": diesel_liters,
        "petrol_liters": petrol_liters,
        "avg_liters": avg_liters,
        "fulfillment_rate": round(fulfillment_rate, 1),
        "page_obj": page_obj,
        "active_nav": "operators",
    }
    return render(request, "portal/operator_detail.html", context)


# ============================================================
# TRUCK OWNER (CUSTOMER) ANALYTICAL REPORTS
# ============================================================

@admin_required
def portal_customer_reports(request):
    pump = get_admin_pump(request.user)
    search_query = request.GET.get("q", "").strip()

    if pump:
        customers = User.objects.filter(
            Q(trucks_owned__fuel_requests__pump=pump) | Q(pump=pump) | Q(created_by=request.user)
        ).filter(role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]).distinct()
    else:
        customers = User.objects.filter(role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER])

    if search_query:
        customers = customers.filter(
            Q(first_name__icontains=search_query) |
            Q(username__icontains=search_query) |
            Q(mobile_number__icontains=search_query)
        )

    customer_list = []
    grand_liters = Decimal("0.00")
    grand_trucks = 0

    for cust in customers:
        trucks = Truck.objects.filter(customer=cust)
        truck_count = trucks.count()
        grand_trucks += truck_count

        cust_requests = FuelRequest.objects.filter(truck__customer=cust)
        if pump and request.user.role != User.Role.ADMIN:
            cust_requests = cust_requests.filter(pump=pump)

        agg = cust_requests.filter(status__in=[FuelRequest.Status.APPROVED, FuelRequest.Status.COMPLETED]).aggregate(
            total_liters=Sum("approved_liters"),
            diesel_liters=Sum("approved_liters", filter=Q(fuel_type=FuelRequest.FuelType.DIESEL)),
            petrol_liters=Sum("approved_liters", filter=Q(fuel_type=FuelRequest.FuelType.PETROL)),
        )
        total_l = agg["total_liters"] or Decimal("0.00")
        diesel_l = agg["diesel_liters"] or Decimal("0.00")
        petrol_l = agg["petrol_liters"] or Decimal("0.00")
        req_count = cust_requests.count()

        grand_liters += total_l

        customer_list.append({
            "customer": cust,
            "truck_count": truck_count,
            "total_liters": total_l,
            "diesel_liters": diesel_l,
            "petrol_liters": petrol_l,
            "total_requests": req_count,
        })

    # Sort by total liters consumed descending
    customer_list.sort(key=lambda x: x["total_liters"], reverse=True)

    context = {
        "pump": pump,
        "customer_list": customer_list,
        "search_query": search_query,
        "total_customers_count": len(customer_list),
        "grand_liters": grand_liters,
        "grand_trucks": grand_trucks,
        "active_nav": "customers",
    }
    return render(request, "portal/customer_reports.html", context)


@admin_required
def portal_customer_detail(request, customer_id):
    pump = get_admin_pump(request.user)
    customer = get_object_or_404(
        User,
        id=customer_id,
        role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]
    )

    days = request.GET.get("days", "all")
    fuel_filter = request.GET.get("fuel_type", "all")

    # Fleet Trucks owned by this customer
    trucks = Truck.objects.filter(customer=customer).select_related("driver")

    # Fuel Requests for this customer's fleet
    requests_qs = FuelRequest.objects.filter(truck__customer=customer).select_related("truck", "driver", "operator", "pump")
    if pump and request.user.role != User.Role.ADMIN:
        requests_qs = requests_qs.filter(pump=pump)

    # Date filter
    now = timezone.now()
    if days == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        requests_qs = requests_qs.filter(created_at__gte=start_date)
    elif days == "7":
        start_date = now - timedelta(days=7)
        requests_qs = requests_qs.filter(created_at__gte=start_date)
    elif days == "30":
        start_date = now - timedelta(days=30)
        requests_qs = requests_qs.filter(created_at__gte=start_date)

    if fuel_filter in ["DIESEL", "PETROL"]:
        requests_qs = requests_qs.filter(fuel_type=fuel_filter)

    # Summary Metrics
    total_requests = requests_qs.count()
    completed_requests = requests_qs.filter(status__in=[FuelRequest.Status.APPROVED, FuelRequest.Status.COMPLETED]).count()

    liters_agg = requests_qs.filter(status__in=[FuelRequest.Status.APPROVED, FuelRequest.Status.COMPLETED]).aggregate(
        total_liters=Sum("approved_liters"),
        diesel_liters=Sum("approved_liters", filter=Q(fuel_type=FuelRequest.FuelType.DIESEL)),
        petrol_liters=Sum("approved_liters", filter=Q(fuel_type=FuelRequest.FuelType.PETROL)),
    )
    total_liters = liters_agg["total_liters"] or Decimal("0.00")
    diesel_liters = liters_agg["diesel_liters"] or Decimal("0.00")
    petrol_liters = liters_agg["petrol_liters"] or Decimal("0.00")

    # Breakdown per truck
    trucks_data = []
    for trk in trucks:
        trk_agg = requests_qs.filter(
            truck=trk,
            status__in=[FuelRequest.Status.APPROVED, FuelRequest.Status.COMPLETED]
        ).aggregate(liters=Sum("approved_liters"), req_count=Count("id"))
        trucks_data.append({
            "truck": trk,
            "liters": trk_agg["liters"] or Decimal("0.00"),
            "requests_count": trk_agg["req_count"] or 0,
        })
    trucks_data.sort(key=lambda x: x["liters"], reverse=True)

    # Paginate requests history
    requests_qs = requests_qs.order_by("-created_at")
    paginator = Paginator(requests_qs, 20)
    page_number = request.GET.get("page", 1)
    page_obj = paginator.get_page(page_number)

    context = {
        "pump": pump,
        "customer": customer,
        "trucks_data": trucks_data,
        "total_trucks": trucks.count(),
        "days": days,
        "fuel_filter": fuel_filter,
        "total_requests": total_requests,
        "completed_requests": completed_requests,
        "total_liters": total_liters,
        "diesel_liters": diesel_liters,
        "petrol_liters": petrol_liters,
        "page_obj": page_obj,
        "active_nav": "customers",
    }
    return render(request, "portal/customer_detail.html", context)


# ============================================================
# AUDIT TRANSACTIONS & EXPORT
# ============================================================

@admin_required
def portal_transactions(request):
    pump = get_admin_pump(request.user)
    
    requests_qs = FuelRequest.objects.all().select_related("truck", "driver", "operator", "pump")
    if pump and request.user.role != User.Role.ADMIN:
        requests_qs = requests_qs.filter(pump=pump)

    # Filters
    op_filter = request.GET.get("operator", "")
    cust_filter = request.GET.get("customer", "")
    status_filter = request.GET.get("status", "")
    fuel_filter = request.GET.get("fuel_type", "")
    search_q = request.GET.get("q", "").strip()

    if op_filter:
        requests_qs = requests_qs.filter(operator_id=op_filter)
    if cust_filter:
        requests_qs = requests_qs.filter(truck__customer_id=cust_filter)
    if status_filter:
        requests_qs = requests_qs.filter(status=status_filter)
    if fuel_filter:
        requests_qs = requests_qs.filter(fuel_type=fuel_filter)
    if search_q:
        requests_qs = requests_qs.filter(
            Q(request_number__icontains=search_q) |
            Q(truck__truck_number__icontains=search_q) |
            Q(driver__first_name__icontains=search_q) |
            Q(driver__mobile_number__icontains=search_q)
        )

    # Check for CSV Export
    if request.GET.get("export") == "csv":
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="fuel_report_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'
        writer = csv.writer(response)
        writer.writerow([
            "Request Number",
            "Date",
            "Station",
            "Operator",
            "Truck Owner",
            "Truck Number",
            "Driver",
            "Fuel Type",
            "Requested Liters",
            "Approved Liters",
            "Status",
            "Remarks",
            "Has Dispenser Image",
            "Has Plate Image",
        ])
        for r in requests_qs.order_by("-created_at"):
            writer.writerow([
                r.request_number,
                r.created_at.strftime("%Y-%m-%d %H:%M:%S") if r.created_at else "",
                r.pump.name if r.pump else "",
                r.operator.get_full_name() or r.operator.username if r.operator else "N/A",
                r.truck.customer.get_full_name() or r.truck.customer.username if r.truck and r.truck.customer else "N/A",
                r.truck.truck_number if r.truck else "",
                r.driver.get_full_name() or r.driver.mobile_number if r.driver else "",
                r.fuel_type,
                str(r.requested_liters),
                str(r.approved_liters or "0.00"),
                r.status,
                r.remarks or "",
                "YES" if r.dispenser_reading_image else "NO",
                "YES" if r.vehicle_plate_image else "NO",
            ])
        return response

    # Dropdown lists for filter bar
    if pump:
        operators = User.objects.filter(
            Q(pump_assignment__pump=pump) | Q(pump=pump) | Q(created_by=request.user)
        ).filter(role=User.Role.OPERATOR).distinct()
        customers = User.objects.filter(
            Q(trucks_owned__fuel_requests__pump=pump) | Q(pump=pump) | Q(created_by=request.user)
        ).filter(role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]).distinct()
    else:
        operators = User.objects.filter(role=User.Role.OPERATOR)
        customers = User.objects.filter(role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER])

    # Aggregates for filtered view
    total_liters = requests_qs.filter(status__in=[FuelRequest.Status.APPROVED, FuelRequest.Status.COMPLETED]).aggregate(
        tot=Sum("approved_liters")
    )["tot"] or Decimal("0.00")
    total_count = requests_qs.count()

    # Paginate
    requests_qs = requests_qs.order_by("-created_at")
    paginator = Paginator(requests_qs, 25)
    page_number = request.GET.get("page", 1)
    page_obj = paginator.get_page(page_number)

    context = {
        "pump": pump,
        "page_obj": page_obj,
        "operators": operators,
        "customers": customers,
        "op_filter": op_filter,
        "cust_filter": cust_filter,
        "status_filter": status_filter,
        "fuel_filter": fuel_filter,
        "search_q": search_q,
        "total_liters": total_liters,
        "total_count": total_count,
        "active_nav": "transactions",
    }
    return render(request, "portal/transactions_report.html", context)


# ============================================================
# PUMP SETTINGS & LOGO MANAGEMENT
# ============================================================

@admin_required
def portal_pump_settings(request):
    pump = get_admin_pump(request.user)
    if not pump:
        messages.error(request, "No fuel station associated with your account.")
        return redirect("portal-dashboard")

    if request.method == "POST":
        action = request.POST.get("action", "update_all")

        if action == "remove_logo":
            if pump.logo:
                pump.logo.delete(save=False)
                pump.logo = None
                pump.save(update_fields=["logo"])
            messages.success(request, "Station logo removed successfully.")
            return redirect("portal-settings")

        # Update contact / address details if provided
        contact_number = request.POST.get("contact_number", "").strip()
        address = request.POST.get("address", "").strip()
        city = request.POST.get("city", "").strip()
        name = request.POST.get("name", "").strip()

        if name:
            pump.name = name
        if contact_number:
            pump.contact_number = contact_number
        if address:
            pump.address = address
        if city:
            pump.city = city

        # Handle Logo file upload
        if "logo" in request.FILES:
            logo_file = request.FILES["logo"]
            valid_exts = [".jpg", ".jpeg", ".png", ".webp", ".svg"]
            ext = "." + logo_file.name.split(".")[-1].lower() if "." in logo_file.name else ""
            if ext not in valid_exts:
                messages.error(request, "Invalid file format. Please upload JPG, PNG, WEBP, or SVG.")
                return redirect("portal-settings")

            # Remove old logo file if exists
            if pump.logo:
                pump.logo.delete(save=False)

            filename = f"logo_{pump.code}_{timezone.now().strftime('%Y%m%d%H%M%S')}{ext}"
            pump.logo.save(filename, logo_file, save=False)
            messages.success(request, "Station logo and information updated successfully! 🎉")
        else:
            messages.success(request, "Station details updated successfully.")

        pump.save()
        return redirect("portal-settings")

    context = {
        "pump": pump,
        "active_nav": "settings",
    }
    return render(request, "portal/settings.html", context)

