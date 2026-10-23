import base64
from datetime import timedelta
from django.shortcuts import render, get_object_or_404
from django.utils import timezone
from django.core.files.base import ContentFile
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from rest_framework_simplejwt.authentication import JWTAuthentication

from django.db.models import Q
from .models import User, Pump, Truck, PumpOperator, FuelRequest
from .serializers import (
    LoginSerializers,
    RegisterSerializer,
    TruckSerializer,
    PumpSerializer,
    AssignDriverSerializer,
    AssignOperatorSerializer,
    CreateFuelRequestSerializer,
    BulkFuelRequestCreateSerializer,
    FuelRequestSerializer,
    CreateCustomerSerializer,
    CreateTruckOwnerSerializer,
    CustomerSerializer,
    CustomerTruckCreateSerializer,
    CreatePumpAdminSerializer,
    CreatePumpOperatorSerializer,
    OperatorListSerializer,
    CreateDriverSerializer,
    DriverListSerializer,
    ChangePasswordSerializer,
    UserSerializer,
)


# ============================================================
# AUTHENTICATION
# ============================================================

class RegistraionAPIView(APIView):
    def post(self, request):
        return Response(
            {
                "error": "Public registration is disabled. All user accounts must be created by administrators."
            },
            status=status.HTTP_403_FORBIDDEN
        )


class LoginAPIView(APIView):
    def post(self, request):
        serializer = LoginSerializers(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)

        pump_info = None
        if user.role in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            pump = Pump.objects.filter(pump_admin=user).first()
            if not pump and user.pump:
                pump = user.pump
            if not pump:
                pump = Pump.objects.filter(is_active=True).first()
            if pump:
                pump_info = {
                    "id": pump.id,
                    "name": pump.name,
                    "code": pump.code,
                    "city": pump.city,
                }
        elif user.role == User.Role.OPERATOR:
            if hasattr(user, "pump_assignment") and user.pump_assignment:
                pump = user.pump_assignment.pump
                pump_info = {
                    "id": pump.id,
                    "name": pump.name,
                    "code": pump.code,
                    "city": pump.city,
                }
            elif user.pump:
                pump_info = {
                    "id": user.pump.id,
                    "name": user.pump.name,
                    "code": user.pump.code,
                    "city": user.pump.city,
                }
        elif user.role in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            if user.pump:
                pump_info = {
                    "id": user.pump.id,
                    "name": user.pump.name,
                    "code": user.pump.code,
                    "city": user.pump.city,
                }

        return Response(
            {
                "message": "Login Successful",
                "user": {
                    "id": user.id,
                    "employee_id": user.employee_id,
                    "username": user.username,
                    "name": user.get_full_name(),
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "mobile_number": user.mobile_number,
                    "role": user.role,
                    "must_change_password": user.must_change_password,
                    "approval_status": user.approval_status,
                    "pump": pump_info,
                    "language": getattr(user, "language", "en") or "en",
                },
                "tokens": {
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                },
            },
            status=status.HTTP_200_OK,
        )


class UserLanguageAPIView(APIView):
    """
    Update the authenticated user's UI language preference (en, hi, mr).
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        lang = request.data.get("language", "en")
        if lang not in ["en", "hi", "mr"]:
            return Response(
                {"error": "Invalid language. Allowed options: 'en' (English), 'hi' (Hindi), 'mr' (Marathi)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.language = lang
        request.user.save(update_fields=["language", "updated_at"])
        return Response(
            {
                "message": "Language preference updated successfully.",
                "language": lang,
            },
            status=status.HTTP_200_OK,
        )


class ChangePasswordAPIView(APIView):
    """
    Allows users to update their password.
    Specifically required on first login for automatically generated credentials.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_password = serializer.validated_data["new_password"]

        request.user.set_password(new_password)
        request.user.plain_password = None
        request.user.must_change_password = False
        request.user.save(update_fields=["password", "plain_password", "must_change_password"])

        return Response(
            {
                "message": "Password changed successfully.",
                "must_change_password": False,
            },
            status=status.HTTP_200_OK
        )


class LogoutAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if not refresh_token:
                return Response(
                    {"error": "Refresh token is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {"message": "Logout successful."},
                status=status.HTTP_205_RESET_CONTENT,
            )
        except TokenError:
            return Response(
                {"error": "Invalid or expired refresh token."},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ============================================================
# PUMP ADMIN APIS (Main Admin of the Pump)
# Flow: Pump Admin creates Regular Customer
# ============================================================

class PumpAdminMyPumpAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only pump admin can access this endpoint."},
                status=status.HTTP_403_FORBIDDEN
            )

        pump = Pump.objects.filter(pump_admin=request.user).first()
        if not pump and request.user.pump:
            pump = request.user.pump
        if not pump:
            pump = Pump.objects.filter(is_active=True).first()

        if not pump:
            return Response(
                {"pump": None, "message": "No pump assigned yet."},
                status=status.HTTP_200_OK
            )

        return Response(
            {"pump": PumpSerializer(pump).data},
            status=status.HTTP_200_OK
        )

    def patch(self, request):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only pump admin can update pump."},
                status=status.HTTP_403_FORBIDDEN
            )
        pump = Pump.objects.filter(pump_admin=request.user).first() or request.user.pump
        if not pump and (request.user.role == User.Role.ADMIN or request.user.is_superuser):
            pump = Pump.objects.first()

        if not pump:
            return Response({"error": "Pump not found."}, status=status.HTTP_404_NOT_FOUND)

        # Handle base64 logo if provided
        logo_data = request.data.get("logo")
        if isinstance(logo_data, str) and ";base64," in logo_data:
            fmt, imgstr = logo_data.split(";base64,")
            ext = fmt.split("/")[-1].split("+")[0]
            if ext == "jpeg":
                ext = "jpg"
            if pump.logo:
                pump.logo.delete(save=False)
            filename = f"logo_{pump.code}_{timezone.now().strftime('%Y%m%d%H%M%S')}.{ext}"
            pump.logo.save(filename, ContentFile(base64.b64decode(imgstr)), save=False)
            data = request.data.copy()
            data.pop("logo", None)
            serializer = PumpSerializer(pump, data=data, partial=True)
        elif "logo" in request.data and (logo_data is None or logo_data == ""):
            if pump.logo:
                pump.logo.delete(save=False)
            pump.logo = None
            data = request.data.copy()
            data.pop("logo", None)
            serializer = PumpSerializer(pump, data=data, partial=True)
        else:
            serializer = PumpSerializer(pump, data=request.data, partial=True)

        serializer.is_valid(raise_exception=True)
        pump = serializer.save()
        return Response(
            {"message": "Pump updated successfully.", "pump": PumpSerializer(pump).data},
            status=status.HTTP_200_OK
        )


# ============================================================
# SUPER ADMIN APIS
# ============================================================

class SuperAdminPumpAdminCreateAPIView(APIView):
    """
    Django Super Admin manually enters Pump Admin's details, username, and password.
    Username and Password must each be exactly 9 characters long.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != User.Role.ADMIN and not request.user.is_superuser:
            return Response(
                {"error": "Only super admin can create pump admin accounts."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = CreatePumpAdminSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        pump_admin = serializer.save()

        return Response(
            {
                "message": "Pump Admin created successfully.",
                "pump_admin": UserSerializer(pump_admin).data,
            },
            status=status.HTTP_201_CREATED
        )


class SuperAdminPumpAdminListAPIView(APIView):
    """
    Super Admin lists all Pump Admins.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.ADMIN and not request.user.is_superuser:
            return Response(
                {"error": "Only super admin can view pump admins."},
                status=status.HTTP_403_FORBIDDEN
            )

        admins = User.objects.filter(role=User.Role.PUMP_ADMIN).order_by("-created_at")
        return Response(
            {"pump_admins": UserSerializer(admins, many=True).data},
            status=status.HTTP_200_OK
        )


# ============================================================
# PUMP ADMIN APIS
# ============================================================

class PumpAdminCustomerCreateAPIView(APIView):
    """
    Pump Admin manually creates a Truck Owner account.
    Username and Password must each be exactly 9 characters long.
    Each Truck Owner is associated with this Pump Admin.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only pump admin can create truck owner accounts."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = CreateTruckOwnerSerializer(
            data=request.data,
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        customer = serializer.save()

        return Response(
            {
                "message": "Truck Owner created successfully.",
                "customer": CustomerSerializer(customer).data,
            },
            status=status.HTTP_201_CREATED
        )


class PumpAdminCustomerListAPIView(APIView):
    """
    Pump Admin lists only their associated Truck Owners.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only pump admin can view truck owners."},
                status=status.HTTP_403_FORBIDDEN
            )

        if request.user.role == User.Role.ADMIN or request.user.is_superuser:
            customers = User.objects.filter(
                role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]
            ).order_by("-created_at")
        else:
            pump = Pump.objects.filter(pump_admin=request.user).first() or request.user.pump
            customers = User.objects.filter(
                role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]
            ).filter(
                Q(created_by=request.user) | Q(pump=pump)
            ).distinct().order_by("-created_at")

        return Response(
            {"customers": CustomerSerializer(customers, many=True).data},
            status=status.HTTP_200_OK
        )


class PumpAdminOperatorCreateAPIView(APIView):
    """
    Pump Admin creates a Pump Operator.
    Mobile number is the username.
    Password format: Last 3 digits of mobile + 2 chars of pump name (uppercase) + 3 random digits.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only pump admin can create pump operators."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = CreatePumpOperatorSerializer(
            data=request.data,
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        operator = serializer.save()

        return Response(
            {
                "message": "Pump operator created successfully.",
                "operator": OperatorListSerializer(operator).data,
                "generated_password": getattr(operator, "generated_password", None),
            },
            status=status.HTTP_201_CREATED
        )


class PumpAdminOperatorListAPIView(APIView):
    """
    Pump Admin lists operators for their pump.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only pump admin can view pump operators."},
                status=status.HTTP_403_FORBIDDEN
            )

        if request.user.role == User.Role.ADMIN or request.user.is_superuser:
            operators = User.objects.filter(role=User.Role.OPERATOR).order_by("-created_at")
        else:
            pump = Pump.objects.filter(pump_admin=request.user).first() or request.user.pump
            if pump:
                operators = User.objects.filter(
                    role=User.Role.OPERATOR
                ).filter(
                    Q(pump=pump) | Q(created_by=request.user) | Q(pump_assignment__pump=pump)
                ).distinct().order_by("-created_at")
            else:
                operators = User.objects.filter(role=User.Role.OPERATOR, created_by=request.user).order_by("-created_at")

        return Response(
            {"operators": OperatorListSerializer(operators, many=True).data},
            status=status.HTTP_200_OK
        )


class PumpAdminOperatorStatusAPIView(APIView):
    """
    Pump Admin activates or deactivates a pump operator.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def patch(self, request, operator_id):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only pump admin can update operator status."},
                status=status.HTTP_403_FORBIDDEN
            )

        operator = get_object_or_404(User, id=operator_id, role=User.Role.OPERATOR)

        # Check pump admin authority
        if request.user.role == User.Role.PUMP_ADMIN:
            pump = Pump.objects.filter(pump_admin=request.user).first() or request.user.pump
            has_perm = (
                operator.created_by == request.user or
                operator.pump == pump or
                (hasattr(operator, "pump_assignment") and operator.pump_assignment.pump == pump)
            )
            if not has_perm:
                return Response(
                    {"error": "You do not have permission to manage this operator."},
                    status=status.HTTP_403_FORBIDDEN
                )

        new_status = request.data.get("is_active")
        if new_status is None:
            operator.is_active = not operator.is_active
        elif isinstance(new_status, str):
            operator.is_active = new_status.lower() in ["true", "1", "yes"]
        else:
            operator.is_active = bool(new_status)

        operator.save(update_fields=["is_active", "updated_at"])

        action_word = "activated" if operator.is_active else "deactivated"
        return Response(
            {
                "message": f"Operator '{operator.get_full_name() or operator.username}' {action_word} successfully.",
                "operator": OperatorListSerializer(operator).data,
            },
            status=status.HTTP_200_OK
        )


class PumpAdminOperatorDeleteAPIView(APIView):
    """
    Pump Admin permanently deletes a pump operator.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, operator_id):
        return self._do_delete(request, operator_id)

    def post(self, request, operator_id):
        return self._do_delete(request, operator_id)

    def _do_delete(self, request, operator_id):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only pump admin can delete an operator."},
                status=status.HTTP_403_FORBIDDEN
            )

        operator = get_object_or_404(User, id=operator_id, role=User.Role.OPERATOR)

        if request.user.role == User.Role.PUMP_ADMIN:
            pump = Pump.objects.filter(pump_admin=request.user).first() or request.user.pump
            has_perm = (
                operator.created_by == request.user or
                operator.pump == pump or
                (hasattr(operator, "pump_assignment") and operator.pump_assignment.pump == pump)
            )
            if not has_perm:
                return Response(
                    {"error": "You do not have permission to delete this operator."},
                    status=status.HTTP_403_FORBIDDEN
                )

        name = operator.get_full_name() or operator.username
        # Remove pump assignment
        PumpOperator.objects.filter(operator=operator).delete()
        # Set handled requests operator to NULL
        FuelRequest.objects.filter(operator=operator).update(operator=None)

        operator.delete()

        return Response(
            {"message": f"Operator '{name}' deleted successfully."},
            status=status.HTTP_200_OK
        )


class PumpAdminDashboardStatsAPIView(APIView):
    """
    Summary metrics for Pump Admin dashboard (scoped to operational pump data).
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only pump admin can view pump dashboard."},
                status=status.HTTP_403_FORBIDDEN
            )

        pump = Pump.objects.filter(pump_admin=request.user).first()
        if not pump and request.user.pump:
            pump = request.user.pump
        if not pump and (request.user.role == User.Role.ADMIN or request.user.is_superuser):
            pump = Pump.objects.first()

        if request.user.role == User.Role.ADMIN or request.user.is_superuser:
            req_qs = FuelRequest.objects.all()
            truck_qs = Truck.objects.filter(customer__isnull=False)
            total_customers = User.objects.filter(role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]).count()
            total_trucks = Truck.objects.count()
            total_operators = User.objects.filter(role=User.Role.OPERATOR).count()
        else:
            req_qs = FuelRequest.objects.filter(pump=pump) if pump else FuelRequest.objects.none()
            truck_qs = Truck.objects.filter(
                Q(customer__created_by=request.user) | Q(customer__pump=pump) | Q(customer__isnull=False)
            ).distinct()
            total_customers = User.objects.filter(
                role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]
            ).filter(Q(created_by=request.user) | Q(pump=pump)).distinct().count()
            total_trucks = Truck.objects.filter(
                Q(customer__created_by=request.user) | Q(customer__pump=pump)
            ).distinct().count()
            total_operators = pump.operators.count() if pump else 0

        total_requests = req_qs.count()
        pending_requests = req_qs.filter(status=FuelRequest.Status.PENDING).count()
        approved_requests = req_qs.filter(status=FuelRequest.Status.APPROVED).count()
        rejected_requests = req_qs.filter(status=FuelRequest.Status.REJECTED).count()
        completed_requests = req_qs.filter(status=FuelRequest.Status.COMPLETED).count()

        # Available trucks eligible for request creation: active trucks without active pending/approved request
        active_truck_ids = set(
            FuelRequest.objects.filter(
                status__in=[
                    FuelRequest.Status.PENDING,
                    FuelRequest.Status.APPROVED,
                    FuelRequest.Status.VERIFIED,
                ]
            ).values_list("truck_id", flat=True)
        )
        eligible_trucks_count = truck_qs.filter(is_active=True).exclude(id__in=active_truck_ids).count()

        # Recent requests (latest 10)
        recent_requests = (
            req_qs.select_related("truck", "truck__customer", "pump", "operator")
            .order_by("-created_at")[:10]
        )

        return Response(
            {
                "pump": PumpSerializer(pump).data if pump else None,
                "stats": {
                    "total_requests": total_requests,
                    "pending_requests": pending_requests,
                    "approved_requests": approved_requests,
                    "rejected_requests": rejected_requests,
                    "completed_requests": completed_requests,
                    "eligible_trucks_count": eligible_trucks_count,
                    "total_trucks": total_trucks,
                    "total_customers": total_customers,
                    "total_operators": total_operators,
                },
                "recent_requests": FuelRequestSerializer(recent_requests, many=True).data,
            },
            status=status.HTTP_200_OK
        )


class PumpAdminEligibleTrucksAPIView(APIView):
    """
    Pump Admin lists owner-added trucks with their eligibility status
    to create single fuel requests.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only pump admins can view eligible trucks."},
                status=status.HTTP_403_FORBIDDEN
            )

        pump = Pump.objects.filter(pump_admin=request.user).first() or request.user.pump
        if not pump and (request.user.role == User.Role.ADMIN or request.user.is_superuser):
            pump = Pump.objects.first()

        qs = Truck.objects.filter(customer__isnull=False).select_related("customer").order_by("-is_active", "truck_number")

        search_q = request.query_params.get("q", "").strip()
        if search_q:
            qs = qs.filter(
                Q(truck_number__icontains=search_q) |
                Q(customer__first_name__icontains=search_q) |
                Q(customer__last_name__icontains=search_q) |
                Q(customer__mobile_number__icontains=search_q)
            )

        return Response(
            {"trucks": TruckSerializer(qs, many=True).data},
            status=status.HTTP_200_OK
        )


class PumpAdminFuelRequestsAPIView(APIView):
    """
    Pump Admin lists and filters all fuel requests for their pump station.
    Supports ?status=PENDING/APPROVED/REJECTED/COMPLETED/ALL and search query ?q=.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only pump admin can view pump fuel requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        pump = Pump.objects.filter(pump_admin=request.user).first() or request.user.pump
        if not pump and (request.user.role == User.Role.ADMIN or request.user.is_superuser):
            pump = Pump.objects.first()

        qs = FuelRequest.objects.filter(pump=pump) if pump else FuelRequest.objects.none()
        if request.user.role == User.Role.ADMIN or request.user.is_superuser:
            qs = FuelRequest.objects.all()

        status_param = request.query_params.get("status", "").strip().upper()
        if status_param and status_param != "ALL":
            qs = qs.filter(status=status_param)

        search_q = request.query_params.get("q", "").strip()
        if search_q:
            qs = qs.filter(
                Q(request_number__icontains=search_q) |
                Q(truck__truck_number__icontains=search_q) |
                Q(truck__customer__first_name__icontains=search_q) |
                Q(truck__customer__last_name__icontains=search_q) |
                Q(truck__customer__mobile_number__icontains=search_q)
            )

        fuel_requests = qs.select_related("truck", "truck__customer", "pump", "operator", "created_by").order_by("-created_at")

        return Response(
            {"fuel_requests": FuelRequestSerializer(fuel_requests, many=True).data},
            status=status.HTTP_200_OK
        )


# ============================================================
# TRUCK OWNER (REGULAR CUSTOMER) APIS
# Flow: Truck Owner creates Truck -> creates Driver -> assigns Driver
# ============================================================

class CustomerTruckListCreateAPIView(APIView):
    """
    Truck Owner lists their own trucks or creates a new truck.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            trucks = Truck.objects.filter(customer=request.user).select_related("driver").order_by("-created_at")
        elif request.user.role in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            if request.user.role == User.Role.ADMIN or request.user.is_superuser:
                trucks = Truck.objects.all().select_related("driver", "customer").order_by("-created_at")
            else:
                trucks = Truck.objects.filter(customer__created_by=request.user).select_related("driver", "customer").order_by("-created_at")
        else:
            return Response(
                {"error": "Only truck owners or admins can list fleet trucks."},
                status=status.HTTP_403_FORBIDDEN
            )

        return Response(
            {"trucks": TruckSerializer(trucks, many=True).data},
            status=status.HTTP_200_OK
        )

    def post(self, request):
        if request.user.role not in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER, User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only truck owners or admins can create trucks."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = CustomerTruckCreateSerializer(
            data=request.data,
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        truck = serializer.save()

        return Response(
            {
                "message": "Truck created successfully.",
                "truck": TruckSerializer(truck).data
            },
            status=status.HTTP_201_CREATED
        )


class CustomerDriverCreateAPIView(APIView):
    """
    Truck Owner creates a Driver account.
    Mobile number is the username.
    System generates a random 8-digit numeric password.
    Associated with this Truck Owner (created_by=request.user).
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER, User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only truck owners can create driver accounts."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = CreateDriverSerializer(
            data=request.data,
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        driver = serializer.save()

        return Response(
            {
                "message": "Driver created successfully.",
                "driver": DriverListSerializer(driver).data,
                "generated_password": getattr(driver, "generated_password", None),
            },
            status=status.HTTP_201_CREATED
        )


class CustomerAvailableDriversAPIView(APIView):
    """
    Lists drivers associated with this Truck Owner.
    If ?active_only=true is passed, filters for is_active=True (used during truck assignment).
    Otherwise returns all drivers so the owner can activate/deactivate/delete them.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        active_only = request.query_params.get("active_only") == "true"

        if request.user.role in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            qs = User.objects.filter(
                role=User.Role.DRIVER,
                approval_status=User.ApprovalStatus.APPROVED,
            ).exclude(
                username__startswith="deleted_"
            ).filter(
                Q(created_by=request.user) | Q(trucks__customer=request.user)
            ).distinct()
        elif request.user.role in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            qs = User.objects.filter(
                role=User.Role.DRIVER,
                approval_status=User.ApprovalStatus.APPROVED,
            ).exclude(
                username__startswith="deleted_"
            )
        else:
            return Response(
                {"error": "Only truck owner or admin can view drivers for assignment."},
                status=status.HTTP_403_FORBIDDEN
            )

        if active_only:
            qs = qs.filter(is_active=True)

        drivers = qs.order_by("first_name")

        return Response(
            {"drivers": DriverListSerializer(drivers, many=True).data},
            status=status.HTTP_200_OK
        )


class CustomerDriverStatusAPIView(APIView):
    """
    Truck Owner activates or deactivates a driver.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def patch(self, request, driver_id):
        if request.user.role not in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER, User.Role.ADMIN]:
            return Response(
                {"error": "Only truck owners can update driver status."},
                status=status.HTTP_403_FORBIDDEN
            )

        driver = get_object_or_404(User, id=driver_id, role=User.Role.DRIVER)

        # Check permission
        if request.user.role in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            has_perm = (
                driver.created_by == request.user or
                driver.trucks.filter(customer=request.user).exists()
            )
            if not has_perm:
                return Response(
                    {"error": "You do not have permission to manage this driver."},
                    status=status.HTTP_403_FORBIDDEN
                )

        new_status = request.data.get("is_active")
        if new_status is None:
            driver.is_active = not driver.is_active
        elif isinstance(new_status, str):
            driver.is_active = new_status.lower() in ["true", "1", "yes"]
        else:
            driver.is_active = bool(new_status)

        # If deactivating, unassign from any truck
        if not driver.is_active:
            Truck.objects.filter(driver=driver).update(driver=None)

        driver.save(update_fields=["is_active", "updated_at"])

        action_word = "activated" if driver.is_active else "deactivated"
        return Response(
            {
                "message": f"Driver '{driver.get_full_name() or driver.username}' {action_word} successfully.",
                "driver": DriverListSerializer(driver).data,
            },
            status=status.HTTP_200_OK
        )


class CustomerDriverDeleteAPIView(APIView):
    """
    Truck Owner deletes a driver ID.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, driver_id):
        return self._do_delete(request, driver_id)

    def post(self, request, driver_id):
        return self._do_delete(request, driver_id)

    def _do_delete(self, request, driver_id):
        if request.user.role not in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER, User.Role.ADMIN]:
            return Response(
                {"error": "Only truck owners can delete driver accounts."},
                status=status.HTTP_403_FORBIDDEN
            )

        driver = get_object_or_404(User, id=driver_id, role=User.Role.DRIVER)

        if request.user.role in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            has_perm = (
                driver.created_by == request.user or
                driver.trucks.filter(customer=request.user).exists()
            )
            if not has_perm:
                return Response(
                    {"error": "You do not have permission to delete this driver."},
                    status=status.HTTP_403_FORBIDDEN
                )

        name = driver.get_full_name() or driver.username

        # Unassign from any truck
        Truck.objects.filter(driver=driver).update(driver=None)

        if driver.fuel_requests.filter(status=FuelRequest.Status.COMPLETED).exists():
            # Completed requests exist: soft-delete to maintain protected relational integrity
            driver.is_active = False
            driver.mobile_number = f"del_{driver.id}_{driver.mobile_number}"[:15]
            driver.username = f"del_{driver.id}_{driver.username}"[:150]
            driver.save(update_fields=["is_active", "mobile_number", "username", "updated_at"])
        else:
            driver.fuel_requests.all().delete()
            driver.delete()

        return Response(
            {"message": f"Driver '{name}' deleted successfully."},
            status=status.HTTP_200_OK
        )


class CustomerFuelRequestsAPIView(APIView):
    """
    Truck Owner views fuel requests made by their trucks/drivers.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            return Response(
                {"error": "Only truck owners can access this endpoint."},
                status=status.HTTP_403_FORBIDDEN
            )

        requests = FuelRequest.objects.filter(
            truck__customer=request.user
        ).select_related("truck", "pump", "driver", "operator").order_by("-created_at")

        return Response(
            {"fuel_requests": FuelRequestSerializer(requests, many=True).data},
            status=status.HTTP_200_OK
        )


class CustomerDashboardStatsAPIView(APIView):
    """
    Summary stats for Truck Owner fleet dashboard.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            return Response(
                {"error": "Only truck owners can view customer dashboard."},
                status=status.HTTP_403_FORBIDDEN
            )

        my_trucks = Truck.objects.filter(customer=request.user)
        total_trucks = my_trucks.count()
        active_trucks = my_trucks.filter(is_active=True).count()

        my_requests = FuelRequest.objects.filter(truck__customer=request.user)
        total_requests = my_requests.count()
        pending_requests = my_requests.filter(status=FuelRequest.Status.PENDING).count()
        approved_requests = my_requests.filter(status=FuelRequest.Status.APPROVED).count()
        rejected_requests = my_requests.filter(status=FuelRequest.Status.REJECTED).count()
        completed_requests = my_requests.filter(status=FuelRequest.Status.COMPLETED).count()

        active_req_truck_ids = set(
            my_requests.filter(
                status__in=[
                    FuelRequest.Status.PENDING,
                    FuelRequest.Status.APPROVED,
                    FuelRequest.Status.VERIFIED,
                ]
            ).values_list("truck_id", flat=True)
        )
        eligible_trucks = my_trucks.filter(is_active=True).exclude(id__in=active_req_truck_ids).count()

        return Response(
            {
                "stats": {
                    "total_trucks": total_trucks,
                    "active_trucks": active_trucks,
                    "eligible_trucks": eligible_trucks,
                    "assigned_trucks": total_trucks,
                    "unassigned_trucks": 0,
                    "total_requests": total_requests,
                    "pending_requests": pending_requests,
                    "approved_requests": approved_requests,
                    "rejected_requests": rejected_requests,
                    "completed_requests": completed_requests,
                }
            },
            status=status.HTTP_200_OK
        )


# ============================================================
# TRUCK APIS
# ============================================================

class TruckCreateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER, User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only truck owners, regular customers or admins can create a truck."},
                status=status.HTTP_403_FORBIDDEN
            )

        if request.user.role in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            serializer = CustomerTruckCreateSerializer(
                data=request.data,
                context={"request": request}
            )
        else:
            serializer = TruckSerializer(
                data=request.data,
                context={"request": request}
            )

        serializer.is_valid(raise_exception=True)
        truck = serializer.save()

        return Response(
            {
                "message": "Truck created successfully.",
                "truck": TruckSerializer(truck).data
            },
            status=status.HTTP_201_CREATED
        )


class AssignDriverToTruckAPIView(APIView):
    """
    Regular customer / Truck Owner (or Admin) assigns a Driver to their Truck.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, truck_id):
        truck = get_object_or_404(Truck, id=truck_id)

        # Check ownership
        if request.user.role in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            if truck.customer_id != request.user.id:
                return Response(
                    {"error": "You can only assign drivers to your own trucks."},
                    status=status.HTTP_403_FORBIDDEN
                )
        elif request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only the customer or an admin can assign a driver."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = AssignDriverSerializer(
            data=request.data,
            context={"truck_id": truck_id}
        )
        serializer.is_valid(raise_exception=True)

        driver_id = serializer.validated_data["driver_id"]
        driver = get_object_or_404(User, id=driver_id)

        truck.driver = driver
        truck.save(update_fields=["driver", "updated_at"])

        return Response(
            {
                "message": f"Driver '{driver.get_full_name()}' assigned to truck '{truck.truck_number}' successfully.",
                "truck": TruckSerializer(truck).data,
                "driver": {
                    "id": driver.id,
                    "name": driver.get_full_name(),
                    "mobile_number": driver.mobile_number,
                }
            },
            status=status.HTTP_200_OK
        )


class MyTruckAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.DRIVER:
            return Response(
                {"error": "Only drivers have an assigned truck."},
                status=status.HTTP_403_FORBIDDEN
            )

        truck = Truck.objects.filter(driver=request.user).first()
        if not truck:
            return Response(
                {"truck": None, "message": "No truck assigned yet."},
                status=status.HTTP_200_OK
            )

        return Response(
            {"truck": TruckSerializer(truck).data},
            status=status.HTTP_200_OK
        )


class TruckUpdateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def put(self, request, truck_id):
        truck = get_object_or_404(Truck, id=truck_id)
        if request.user.role in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            if truck.customer_id != request.user.id:
                return Response(
                    {"error": "You can only update your own trucks."},
                    status=status.HTTP_403_FORBIDDEN
                )
        elif request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only customer or admin can update a truck."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = TruckSerializer(truck, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        truck = serializer.save()

        return Response(
            {
                "message": "Truck updated successfully.",
                "truck": TruckSerializer(truck).data
            },
            status=status.HTTP_200_OK
        )

    def patch(self, request, truck_id):
        return self.put(request, truck_id)


class TruckDeleteAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, truck_id):
        truck = get_object_or_404(Truck, id=truck_id)
        if request.user.role in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            if truck.customer_id != request.user.id:
                return Response(
                    {"error": "You can only delete your own trucks."},
                    status=status.HTTP_403_FORBIDDEN
                )
        elif request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only customer or admin can delete a truck."},
                status=status.HTTP_403_FORBIDDEN
            )

        truck_number = truck.truck_number
        truck.delete()
        return Response(
            {"message": f"Truck '{truck_number}' deleted successfully."},
            status=status.HTTP_200_OK
        )


# ============================================================
# PUMP APIS
# ============================================================

class PumpCreateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only admin can create a pump."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = PumpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pump = serializer.save()

        # If pump_admin_id provided, assign
        admin_id = request.data.get("pump_admin_id")
        if admin_id:
            try:
                pump_admin_user = User.objects.get(id=admin_id)
                pump.pump_admin = pump_admin_user
                pump.save(update_fields=["pump_admin"])
            except User.DoesNotExist:
                pass

        return Response(
            {
                "message": "Pump created successfully.",
                "pump": PumpSerializer(pump).data
            },
            status=status.HTTP_201_CREATED
        )


class PumpListAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        pumps = Pump.objects.filter(is_active=True).order_by("name")
        return Response(
            {"pumps": PumpSerializer(pumps, many=True).data},
            status=status.HTTP_200_OK
        )


class MyPumpAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role == User.Role.OPERATOR:
            if hasattr(request.user, "pump_assignment"):
                pump = request.user.pump_assignment.pump
                return Response(
                    {"pump": PumpSerializer(pump).data},
                    status=status.HTTP_200_OK
                )
            return Response(
                {"pump": None, "message": "No pump assigned yet."},
                status=status.HTTP_200_OK
            )
        elif request.user.role in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            pump = Pump.objects.filter(pump_admin=request.user).first()
            if not pump:
                pump = Pump.objects.first()
            return Response(
                {"pump": PumpSerializer(pump).data if pump else None},
                status=status.HTTP_200_OK
            )

        return Response(
            {"error": "Only operators or pump admins have an assigned pump."},
            status=status.HTTP_403_FORBIDDEN
        )


class AssignOperatorToPumpAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, pump_id):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only admin can assign an operator."},
                status=status.HTTP_403_FORBIDDEN
            )

        pump = get_object_or_404(Pump, id=pump_id)
        serializer = AssignOperatorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        operator_id = serializer.validated_data["operator_id"]
        operator = get_object_or_404(User, id=operator_id)

        PumpOperator.objects.create(pump=pump, operator=operator)

        return Response(
            {
                "message": "Operator assigned successfully.",
                "pump": {"id": pump.id, "name": pump.name, "code": pump.code},
                "operator": {
                    "id": operator.id,
                    "name": operator.get_full_name(),
                    "mobile_number": operator.mobile_number,
                }
            },
            status=status.HTTP_201_CREATED
        )


class PumpUpdateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def put(self, request, pump_id):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only admin can update a pump."},
                status=status.HTTP_403_FORBIDDEN
            )

        pump = get_object_or_404(Pump, id=pump_id)
        serializer = PumpSerializer(pump, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        pump = serializer.save()

        return Response(
            {
                "message": "Pump updated successfully.",
                "pump": PumpSerializer(pump).data
            },
            status=status.HTTP_200_OK
        )


class PumpDeleteAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, pump_id):
        if request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only admin can delete a pump."},
                status=status.HTTP_403_FORBIDDEN
            )

        pump = get_object_or_404(Pump, id=pump_id)
        pump_name = pump.name
        pump.delete()

        return Response(
            {"message": f"Pump '{pump_name}' deleted successfully."},
            status=status.HTTP_200_OK
        )


# ============================================================
# FUEL REQUEST APIS (DRIVER & OPERATOR) - ZERO OCR
# ============================================================

class CreateFuelRequestAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreateFuelRequestSerializer(
            data=request.data,
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        fuel_request = serializer.save()

        return Response(
            {
                "message": (
                    "Fuel request created successfully. "
                    "Waiting for operator approval."
                ),
                "fuel_request": FuelRequestSerializer(fuel_request).data
            },
            status=status.HTTP_201_CREATED
        )


class BulkFuelRequestCreateAPIView(APIView):
    """
    Truck Owner creates fuel requests for multiple trucks in a single bulk operation.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER, User.Role.ADMIN]:
            return Response(
                {"error": "Only Truck Owners can create bulk fuel requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = BulkFuelRequestCreateSerializer(
            data=request.data,
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        created_requests = serializer.save()

        return Response(
            {
                "message": f"Successfully created {len(created_requests)} fuel request(s).",
                "count": len(created_requests),
                "fuel_requests": FuelRequestSerializer(created_requests, many=True).data,
            },
            status=status.HTTP_201_CREATED
        )


class MyFuelRequestsAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.DRIVER:
            return Response(
                {"error": "Only drivers can view their own fuel requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        fuel_requests = (
            FuelRequest.objects
            .filter(driver=request.user)
            .select_related("truck", "pump", "operator")
            .order_by("-created_at")
        )

        return Response(
            {"fuel_requests": FuelRequestSerializer(fuel_requests, many=True).data},
            status=status.HTTP_200_OK
        )


class OperatorPumpRequestsAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in [User.Role.OPERATOR, User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only operators can view their pump's fuel requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        pump = None
        if hasattr(request.user, "pump_assignment") and request.user.pump_assignment:
            pump = request.user.pump_assignment.pump
        elif request.user.pump:
            pump = request.user.pump
        elif request.user.role in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            pump = Pump.objects.filter(pump_admin=request.user).first() or Pump.objects.first()

        if not pump:
            return Response(
                {"fuel_requests": [], "message": "You are not assigned to any pump."},
                status=status.HTTP_200_OK
            )

        fuel_requests = FuelRequest.objects.filter(
            pump=pump,
            status=FuelRequest.Status.PENDING
        ).select_related("driver", "truck", "pump", "truck__customer").order_by("-created_at")

        return Response(
            {"fuel_requests": FuelRequestSerializer(fuel_requests, many=True).data},
            status=status.HTTP_200_OK
        )


class OperatorCompletedRequestsAPIView(APIView):
    """
    Returns successfully completed / approved fuel requests for the operator's pump
    within the last 1 month (last 30 days).
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in [User.Role.OPERATOR, User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only pump operators and pump admins can view completed requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        pump = None
        if hasattr(request.user, "pump_assignment") and request.user.pump_assignment:
            pump = request.user.pump_assignment.pump
        elif request.user.pump:
            pump = request.user.pump
        elif request.user.role in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            pump = Pump.objects.filter(pump_admin=request.user).first() or Pump.objects.first()

        if not pump:
            return Response(
                {
                    "fuel_requests": [],
                    "stats": {
                        "total_requests": 0,
                        "total_liters": 0,
                        "diesel_liters": 0,
                        "petrol_liters": 0,
                        "period": "Last 30 Days",
                    },
                    "message": "You are not assigned to any pump station.",
                },
                status=status.HTTP_200_OK,
            )

        one_month_ago = timezone.now() - timedelta(days=30)

        filter_kwargs = {
            "pump": pump,
            "status__in": [FuelRequest.Status.COMPLETED, FuelRequest.Status.APPROVED],
            "created_at__gte": one_month_ago,
        }

        # Each operator only sees their own completed/approved requests
        if request.user.role == User.Role.OPERATOR:
            filter_kwargs["operator"] = request.user

        fuel_requests = (
            FuelRequest.objects.filter(**filter_kwargs)
            .select_related("driver", "truck", "pump", "truck__customer", "operator")
            .order_by("-completed_at", "-updated_at", "-created_at")
        )

        total_requests = fuel_requests.count()
        total_liters = 0.0
        diesel_liters = 0.0
        petrol_liters = 0.0

        for r in fuel_requests:
            amt = float(r.approved_liters or r.requested_liters or 0)
            total_liters += amt
            if r.fuel_type == FuelRequest.FuelType.DIESEL:
                diesel_liters += amt
            elif r.fuel_type == FuelRequest.FuelType.PETROL:
                petrol_liters += amt

        return Response(
            {
                "fuel_requests": FuelRequestSerializer(fuel_requests, many=True).data,
                "stats": {
                    "total_requests": total_requests,
                    "total_liters": round(total_liters, 2),
                    "diesel_liters": round(diesel_liters, 2),
                    "petrol_liters": round(petrol_liters, 2),
                    "period": "Last 30 Days",
                    "pump_name": pump.name,
                    "pump_code": pump.code,
                },
            },
            status=status.HTTP_200_OK,
        )


class ApproveFuelRequestAPIView(APIView):
    """
    Operator approves a pending fuel request.
    Requires two photos:
      1) Dispenser reading image
      2) Vehicle number plate image
    Supports multipart form files and base64 encoded strings.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, fuel_request_id):
        if request.user.role != User.Role.OPERATOR:
            return Response(
                {"error": "Only pump operators can approve fuel requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        operator = request.user
        fuel_request = get_object_or_404(FuelRequest, id=fuel_request_id)

        if fuel_request.status != FuelRequest.Status.PENDING:
            if fuel_request.status == FuelRequest.Status.APPROVED:
                return Response(
                    {
                        "status": "APPROVED",
                        "message": "This fuel request has already been approved.",
                        "fuel_request": FuelRequestSerializer(fuel_request).data,
                    },
                    status=status.HTTP_200_OK
                )
            return Response(
                {"error": f"Fuel request is not pending (current status: {fuel_request.status})."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check pump assignment flexibly (supports pump_assignment or direct pump)
        operator_pump = None
        if hasattr(operator, "pump_assignment"):
            operator_pump = operator.pump_assignment.pump
        elif hasattr(operator, "pump") and operator.pump:
            operator_pump = operator.pump

        if not operator_pump or operator_pump.id != fuel_request.pump_id:
            return Response(
                {"error": "You are not assigned to this pump."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Validate images (Dispenser reading & Vehicle number plate)
        dispenser_img_file = request.FILES.get("dispenser_reading_image")
        dispenser_img_b64 = request.data.get("dispenser_reading_image")
        plate_img_file = request.FILES.get("vehicle_plate_image")
        plate_img_b64 = request.data.get("vehicle_plate_image")

        if not dispenser_img_file and not dispenser_img_b64:
            return Response(
                {"error": "Dispenser reading photo is required. Please capture the meter reading."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not plate_img_file and not plate_img_b64:
            return Response(
                {"error": "Vehicle number plate photo is required. Please capture the truck plate."},
                status=status.HTTP_400_BAD_REQUEST
            )

        approved_liters = request.data.get("approved_liters")
        if approved_liters is not None:
            try:
                approved_liters = float(approved_liters)
                if approved_liters <= 0:
                    raise ValueError
            except (ValueError, TypeError):
                return Response(
                    {"error": "approved_liters must be a positive number."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            approved_liters = fuel_request.requested_liters

        timestamp_str = timezone.now().strftime("%Y%m%d%H%M%S")

        # Save dispenser reading image
        if dispenser_img_file:
            fuel_request.dispenser_reading_image = dispenser_img_file
        elif dispenser_img_b64:
            raw = dispenser_img_b64
            if isinstance(raw, str):
                if ";base64," in raw:
                    raw = raw.split(";base64,")[1]
                try:
                    fuel_request.dispenser_reading_image.save(
                        f"dispenser_{fuel_request.request_number}_{timestamp_str}.jpg",
                        ContentFile(base64.b64decode(raw)),
                        save=False
                    )
                except Exception as e:
                    return Response(
                        {"error": f"Failed to save dispenser reading photo: {str(e)}"},
                        status=status.HTTP_400_BAD_REQUEST
                    )

        # Save vehicle number plate image
        if plate_img_file:
            fuel_request.vehicle_plate_image = plate_img_file
        elif plate_img_b64:
            raw = plate_img_b64
            if isinstance(raw, str):
                if ";base64," in raw:
                    raw = raw.split(";base64,")[1]
                try:
                    fuel_request.vehicle_plate_image.save(
                        f"plate_{fuel_request.request_number}_{timestamp_str}.jpg",
                        ContentFile(base64.b64decode(raw)),
                        save=False
                    )
                except Exception as e:
                    return Response(
                        {"error": f"Failed to save vehicle plate photo: {str(e)}"},
                        status=status.HTTP_400_BAD_REQUEST
                    )

        fuel_request.operator = operator
        fuel_request.approved_liters = approved_liters
        fuel_request.status = FuelRequest.Status.APPROVED
        fuel_request.approved_at = timezone.now()
        fuel_request.save()

        # Update or create vehicle verification record if applicable
        try:
            from .models import VehicleVerification
            vv, _ = VehicleVerification.objects.get_or_create(fuel_request=fuel_request)
            vv.status = VehicleVerification.VerificationStatus.VERIFIED
            vv.verified_by = operator
            vv.verified_at = timezone.now()
            if fuel_request.vehicle_plate_image:
                vv.vehicle_image = fuel_request.vehicle_plate_image
            vv.save()
        except Exception:
            pass

        return Response(
            {
                "status": "APPROVED",
                "message": f"Fuel request '{fuel_request.request_number}' verified and approved for {approved_liters}L.",
                "fuel_request": FuelRequestSerializer(fuel_request).data,
            },
            status=status.HTTP_200_OK
        )


class RejectFuelRequestAPIView(APIView):
    """
    Operator rejects a fuel request with an optional remark.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, fuel_request_id):
        if request.user.role != User.Role.OPERATOR:
            return Response(
                {"error": "Only pump operators can reject fuel requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        fuel_request = get_object_or_404(FuelRequest, id=fuel_request_id)
        remarks = request.data.get("remarks", "Rejected by pump operator")

        fuel_request.operator = request.user
        fuel_request.status = FuelRequest.Status.REJECTED
        fuel_request.remarks = remarks
        fuel_request.save(update_fields=["operator", "status", "remarks", "updated_at"])

        return Response(
            {
                "status": "REJECTED",
                "message": f"Fuel request '{fuel_request.request_number}' was rejected.",
                "fuel_request": FuelRequestSerializer(fuel_request).data,
            },
            status=status.HTTP_200_OK
        )


class CompleteFuelRequestAPIView(APIView):
    """
    Operator marks fuel dispensing as completed.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, fuel_request_id):
        if request.user.role != User.Role.OPERATOR:
            return Response(
                {"error": "Only pump operators can complete fuel requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        fuel_request = get_object_or_404(FuelRequest, id=fuel_request_id)
        fuel_request.status = FuelRequest.Status.COMPLETED
        fuel_request.completed_at = timezone.now()
        fuel_request.save(update_fields=["status", "completed_at", "updated_at"])

        return Response(
            {
                "status": "COMPLETED",
                "message": f"Fuel request '{fuel_request.request_number}' completed.",
                "fuel_request": FuelRequestSerializer(fuel_request).data,
            },
            status=status.HTTP_200_OK
        )


# Backward compatibility aliases (zero OCR)
VerifyFuelRequestVehicleAPIView = ApproveFuelRequestAPIView
ManualVerifyFuelRequestAPIView = ApproveFuelRequestAPIView


class FuelRequestUpdateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def put(self, request, fuel_request_id):
        fuel_request = get_object_or_404(FuelRequest, id=fuel_request_id)

        if request.user.role == User.Role.DRIVER:
            if fuel_request.driver_id != request.user.id:
                return Response(
                    {"error": "You can only update your own fuel requests."},
                    status=status.HTTP_403_FORBIDDEN
                )
            if fuel_request.status != FuelRequest.Status.PENDING:
                return Response(
                    {"error": "Can only update pending fuel requests."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        elif request.user.role == User.Role.OPERATOR:
            if fuel_request.operator_id != request.user.id:
                return Response(
                    {"error": "You can only update requests assigned to you."},
                    status=status.HTTP_403_FORBIDDEN
                )
        elif request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "You do not have permission to update fuel requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = FuelRequestSerializer(fuel_request, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        fuel_request = serializer.save()

        return Response(
            {
                "message": "Fuel request updated successfully.",
                "fuel_request": FuelRequestSerializer(fuel_request).data
            },
            status=status.HTTP_200_OK
        )


class FuelRequestDeleteAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, fuel_request_id):
        fuel_request = get_object_or_404(FuelRequest, id=fuel_request_id)

        if request.user.role == User.Role.DRIVER:
            if fuel_request.driver_id != request.user.id:
                return Response(
                    {"error": "You can only delete your own fuel requests."},
                    status=status.HTTP_403_FORBIDDEN
                )
            if fuel_request.status != FuelRequest.Status.PENDING:
                return Response(
                    {"error": "Can only delete pending fuel requests."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        elif request.user.role not in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only admin can delete fuel requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        request_number = fuel_request.request_number
        fuel_request.delete()

        return Response(
            {"message": f"Fuel request '{request_number}' deleted successfully."},
            status=status.HTTP_200_OK
        )