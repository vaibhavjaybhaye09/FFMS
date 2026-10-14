from django.shortcuts import render, get_object_or_404
from django.utils import timezone
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
                },
                "tokens": {
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                },
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
        request.user.must_change_password = False
        request.user.save(update_fields=["password", "must_change_password"])

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


class PumpAdminDashboardStatsAPIView(APIView):
    """
    Summary metrics for Pump Admin (scoped to their own data).
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
            total_customers = User.objects.filter(role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]).count()
            total_trucks = Truck.objects.count()
            total_operators = User.objects.filter(role=User.Role.OPERATOR).count()
            total_requests = FuelRequest.objects.count()
            pending_requests = FuelRequest.objects.filter(status=FuelRequest.Status.PENDING).count()
            completed_requests = FuelRequest.objects.filter(status=FuelRequest.Status.COMPLETED).count()
        else:
            total_customers = User.objects.filter(
                role__in=[User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]
            ).filter(Q(created_by=request.user) | Q(pump=pump)).distinct().count()

            total_trucks = Truck.objects.filter(
                Q(customer__created_by=request.user) | Q(customer__pump=pump)
            ).distinct().count()

            total_operators = pump.operators.count() if pump else 0
            total_requests = FuelRequest.objects.filter(pump=pump).count() if pump else 0
            pending_requests = FuelRequest.objects.filter(pump=pump, status=FuelRequest.Status.PENDING).count() if pump else 0
            completed_requests = FuelRequest.objects.filter(pump=pump, status=FuelRequest.Status.COMPLETED).count() if pump else 0

        return Response(
            {
                "pump": PumpSerializer(pump).data if pump else None,
                "stats": {
                    "total_customers": total_customers,
                    "total_trucks": total_trucks,
                    "total_operators": total_operators,
                    "total_requests": total_requests,
                    "pending_requests": pending_requests,
                    "completed_requests": completed_requests,
                }
            },
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
    Lists approved active drivers associated with this Truck Owner.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            drivers = User.objects.filter(
                role=User.Role.DRIVER,
                approval_status=User.ApprovalStatus.APPROVED,
                is_active=True
            ).filter(
                Q(created_by=request.user) | Q(trucks__customer=request.user)
            ).distinct().order_by("first_name")
        elif request.user.role in [User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            drivers = User.objects.filter(
                role=User.Role.DRIVER,
                approval_status=User.ApprovalStatus.APPROVED,
                is_active=True
            ).order_by("first_name")
        else:
            return Response(
                {"error": "Only truck owner or admin can view drivers for assignment."},
                status=status.HTTP_403_FORBIDDEN
            )

        return Response(
            {"drivers": DriverListSerializer(drivers, many=True).data},
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
        assigned_trucks = my_trucks.filter(driver__isnull=False).count()
        unassigned_trucks = total_trucks - assigned_trucks

        my_requests = FuelRequest.objects.filter(truck__customer=request.user)
        total_requests = my_requests.count()
        pending_requests = my_requests.filter(status=FuelRequest.Status.PENDING).count()
        approved_requests = my_requests.filter(status=FuelRequest.Status.APPROVED).count()
        completed_requests = my_requests.filter(status=FuelRequest.Status.COMPLETED).count()

        return Response(
            {
                "stats": {
                    "total_trucks": total_trucks,
                    "assigned_trucks": assigned_trucks,
                    "unassigned_trucks": unassigned_trucks,
                    "total_requests": total_requests,
                    "pending_requests": pending_requests,
                    "approved_requests": approved_requests,
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
        if request.user.role not in [User.Role.REGULAR_CUSTOMER, User.Role.ADMIN, User.Role.PUMP_ADMIN]:
            return Response(
                {"error": "Only regular customers or admins can create a truck."},
                status=status.HTTP_403_FORBIDDEN
            )

        if request.user.role == User.Role.REGULAR_CUSTOMER:
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
    Regular customer (or Admin) assigns a Driver to their Truck.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, truck_id):
        truck = get_object_or_404(Truck, id=truck_id)

        # Check ownership
        if request.user.role == User.Role.REGULAR_CUSTOMER:
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
        if request.user.role == User.Role.REGULAR_CUSTOMER:
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


class TruckDeleteAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, truck_id):
        truck = get_object_or_404(Truck, id=truck_id)
        if request.user.role == User.Role.REGULAR_CUSTOMER:
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
        if request.user.role != User.Role.OPERATOR:
            return Response(
                {"error": "Only operators can view their pump's fuel requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            pump = request.user.pump_assignment.pump
        except Exception:
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


class ApproveFuelRequestAPIView(APIView):
    """
    Operator directly approves a pending fuel request (NO OCR needed).
    Allows entering or confirming approved liters.
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

        # Check pump assignment
        if not hasattr(operator, "pump_assignment") or operator.pump_assignment.pump_id != fuel_request.pump_id:
            return Response(
                {"error": "You are not assigned to this pump."},
                status=status.HTTP_403_FORBIDDEN
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

        fuel_request.operator = operator
        fuel_request.approved_liters = approved_liters
        fuel_request.status = FuelRequest.Status.APPROVED
        fuel_request.approved_at = timezone.now()
        fuel_request.save(
            update_fields=[
                "operator",
                "approved_liters",
                "status",
                "approved_at",
                "updated_at",
            ]
        )

        return Response(
            {
                "status": "APPROVED",
                "message": f"Fuel request '{fuel_request.request_number}' approved successfully for {approved_liters}L.",
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