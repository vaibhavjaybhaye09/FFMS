import re
import random
from rest_framework import serializers
from django.contrib.auth import authenticate, get_user_model
from django.db.models import Q
from rest_framework.validators import UniqueValidator

from .models import (
    User,
    Pump,
    Truck,
    FuelRequest,
    VehicleVerification,
    PumpOperator,
)

User = get_user_model()


# ============================================================
# REGISTRATION (DISABLED)
# ============================================================

class RegisterSerializer(serializers.Serializer):
    def validate(self, attrs):
        raise serializers.ValidationError(
            "Public registration is disabled. Accounts must be created by administrators."
        )


# ============================================================
# SUPER ADMIN: CREATE PUMP ADMIN SERIALIZER
# ============================================================

class CreatePumpAdminSerializer(serializers.ModelSerializer):
    username = serializers.CharField(
        min_length=9,
        max_length=9,
        help_text="Exactly 9 characters long"
    )
    password = serializers.CharField(
        min_length=9,
        max_length=9,
        write_only=True,
        help_text="Exactly 9 characters long"
    )
    mobile_number = serializers.CharField(
        required=False,
        allow_blank=True
    )

    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "username",
            "password",
            "mobile_number",
        ]

    def validate_username(self, value):
        val = value.strip()
        if len(val) != 9:
            raise serializers.ValidationError("Username must be exactly 9 characters long.")
        if User.objects.filter(username__iexact=val).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return val

    def validate_password(self, value):
        if len(value) != 9:
            raise serializers.ValidationError("Password must be exactly 9 characters long.")
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        created_by = request.user if request and request.user.is_authenticated else None
        password = validated_data.pop("password")
        username = validated_data.pop("username")
        mobile = validated_data.pop("mobile_number", None) or username

        user = User.objects.create_user(
            username=username,
            mobile_number=mobile,
            password=password,
            role=User.Role.PUMP_ADMIN,
            approval_status=User.ApprovalStatus.APPROVED,
            is_active=True,
            is_staff=True,
            created_by=created_by,
            must_change_password=False,
            **validated_data
        )
        user.employee_id = f"PADM{user.id:05d}"
        user.save(update_fields=["employee_id"])
        return user


# ============================================================
# USER SERIALIZER
# ============================================================

class UserSerializer(serializers.ModelSerializer):

    class Meta:
        model = User

        fields = [
            "id",
            "employee_id",
            "username",
            "first_name",
            "last_name",
            "mobile_number",
            "role",
        ]

        read_only_fields = [
            "id",
            "employee_id",
            "role",
        ]

class AssignOperatorSerializer(serializers.Serializer):

    operator_id = serializers.IntegerField()

    def validate_operator_id(self, value):

        try:
            operator = User.objects.get(
                id=value
            )
        except User.DoesNotExist:
            raise serializers.ValidationError(
                "Operator does not exist."
            )

        if operator.role != User.Role.OPERATOR:
            raise serializers.ValidationError(
                "Selected user is not an operator."
            )

        if not operator.is_active:
            raise serializers.ValidationError(
                "Operator account is inactive."
            )

        if operator.approval_status != User.ApprovalStatus.APPROVED:
            raise serializers.ValidationError(
                "Operator account is not approved."
            )

        # Operator already assigned to another pump
        if hasattr(operator, "pump_assignment"):
            raise serializers.ValidationError(
                "This operator is already assigned to another pump."
            )

        return value

# ============================================================
# PUMP SERIALIZER
# ============================================================

class PumpSerializer(serializers.ModelSerializer):

    class Meta:
        model = Pump

        fields = [
            "id",
            "name",
            "code",
            "address",
            "city",
            "contact_number",
            "is_active",
        ]

        read_only_fields = [
            "id",
        ]


# ============================================================
# TRUCK OWNER (CUSTOMER) SERIALIZERS
# ============================================================

class CreateTruckOwnerSerializer(serializers.ModelSerializer):
    username = serializers.CharField(
        min_length=9,
        max_length=9,
        help_text="Username must be exactly 9 characters long"
    )
    password = serializers.CharField(
        min_length=9,
        max_length=9,
        write_only=True,
        help_text="Password must be exactly 9 characters long"
    )
    mobile_number = serializers.CharField(max_length=15)

    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "username",
            "password",
            "mobile_number",
        ]

    def validate_username(self, value):
        val = value.strip()
        if len(val) != 9:
            raise serializers.ValidationError("Username must be exactly 9 characters long.")
        if User.objects.filter(username__iexact=val).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return val

    def validate_password(self, value):
        if len(value) != 9:
            raise serializers.ValidationError("Password must be exactly 9 characters long.")
        return value

    def validate_mobile_number(self, value):
        val = re.sub(r"\D", "", value)
        if len(val) < 10:
            raise serializers.ValidationError("Mobile number must be at least 10 digits.")
        if User.objects.filter(mobile_number=val).exists():
            raise serializers.ValidationError("A user with this mobile number already exists.")
        return val

    def create(self, validated_data):
        request = self.context.get("request")
        created_by = request.user if request and request.user.is_authenticated else None

        pump = None
        if created_by:
            if hasattr(created_by, "managed_pumps") and created_by.managed_pumps.exists():
                pump = created_by.managed_pumps.first()
            elif created_by.pump:
                pump = created_by.pump

        password = validated_data.pop("password")
        username = validated_data.pop("username")
        mobile = validated_data.pop("mobile_number")

        user = User.objects.create_user(
            username=username,
            mobile_number=mobile,
            password=password,
            role=User.Role.TRUCK_OWNER,
            approval_status=User.ApprovalStatus.APPROVED,
            is_active=True,
            created_by=created_by,
            pump=pump,
            must_change_password=False,
            **validated_data
        )
        user.employee_id = f"TOWN{user.id:05d}"
        user.save(update_fields=["employee_id"])
        return user


# Backwards compatibility alias
CreateCustomerSerializer = CreateTruckOwnerSerializer


class CustomerSerializer(serializers.ModelSerializer):
    trucks_count = serializers.SerializerMethodField()
    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "employee_id",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "mobile_number",
            "role",
            "approval_status",
            "is_active",
            "trucks_count",
            "created_at",
        ]

    def get_trucks_count(self, obj):
        return obj.trucks_owned.count()


# ============================================================
# PUMP OPERATOR SERIALIZERS
# ============================================================

class CreatePumpOperatorSerializer(serializers.ModelSerializer):
    mobile_number = serializers.CharField(max_length=15)
    pump_id = serializers.IntegerField(required=False, write_only=True)

    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "mobile_number",
            "pump_id",
        ]

    def validate_mobile_number(self, value):
        val = re.sub(r"\D", "", value)
        if len(val) < 10:
            raise serializers.ValidationError("Mobile number must be at least 10 digits.")
        if User.objects.filter(Q(username=val) | Q(mobile_number=val)).exists():
            raise serializers.ValidationError("A user with this mobile number already exists.")
        return val

    def create(self, validated_data):
        request = self.context.get("request")
        created_by = request.user if request and request.user.is_authenticated else None

        pump_id = validated_data.pop("pump_id", None)
        pump = None
        if pump_id:
            pump = Pump.objects.filter(id=pump_id).first()
        if not pump and created_by:
            if hasattr(created_by, "managed_pumps") and created_by.managed_pumps.exists():
                pump = created_by.managed_pumps.first()
            elif created_by.pump:
                pump = created_by.pump
        if not pump:
            pump = Pump.objects.first()

        mobile = validated_data.pop("mobile_number")
        last3 = mobile[-3:]
        clean_name = re.sub(r"[^a-zA-Z]", "", pump.name if pump else "Pump")
        prefix = (clean_name[:2] if len(clean_name) >= 2 else "PM").upper()
        rand3 = f"{random.randint(100, 999)}"
        generated_password = f"{last3}{prefix}{rand3}"

        user = User.objects.create_user(
            username=mobile,
            mobile_number=mobile,
            password=generated_password,
            role=User.Role.OPERATOR,
            approval_status=User.ApprovalStatus.APPROVED,
            is_active=True,
            created_by=created_by,
            pump=pump,
            must_change_password=True,
            **validated_data
        )
        user.employee_id = f"OPER{user.id:05d}"
        user.save(update_fields=["employee_id"])

        if pump:
            PumpOperator.objects.get_or_create(pump=pump, operator=user)

        user.generated_password = generated_password
        return user


class OperatorListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    pump_name = serializers.SerializerMethodField()
    pump_code = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "employee_id",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "mobile_number",
            "is_active",
            "pump_name",
            "pump_code",
            "must_change_password",
            "created_at",
        ]

    def get_pump_name(self, obj):
        if hasattr(obj, "pump_assignment") and obj.pump_assignment:
            return obj.pump_assignment.pump.name
        if obj.pump:
            return obj.pump.name
        return None

    def get_pump_code(self, obj):
        if hasattr(obj, "pump_assignment") and obj.pump_assignment:
            return obj.pump_assignment.pump.code
        if obj.pump:
            return obj.pump.code
        return None


# ============================================================
# TRUCK SERIALIZERS
# ============================================================

class TruckSerializer(serializers.ModelSerializer):

    driver_name = serializers.CharField(
        source="driver.first_name",
        read_only=True
    )
    driver_mobile = serializers.CharField(
        source="driver.mobile_number",
        read_only=True
    )
    customer_name = serializers.CharField(
        source="customer.first_name",
        read_only=True
    )

    class Meta:
        model = Truck

        fields = [
            "id",
            "truck_number",
            "customer",
            "customer_name",
            "driver",
            "driver_name",
            "driver_mobile",
            "fuel_type",
            "capacity_liters",
            "is_active",
            "created_at",
        ]

        read_only_fields = [
            "id",
            "customer_name",
            "driver_name",
            "driver_mobile",
            "created_at",
        ]


class CustomerTruckCreateSerializer(serializers.ModelSerializer):

    truck_number = serializers.CharField(
        validators=[
            UniqueValidator(
                queryset=Truck.objects.all(),
                message="A truck with this number already exists."
            )
        ]
    )

    class Meta:
        model = Truck
        fields = [
            "truck_number",
            "fuel_type",
            "capacity_liters",
        ]

    def create(self, validated_data):
        request = self.context.get("request")
        customer = request.user
        return Truck.objects.create(
            customer=customer,
            **validated_data
        )


# ============================================================
# DRIVER SERIALIZERS
# ============================================================

class CreateDriverSerializer(serializers.ModelSerializer):
    mobile_number = serializers.CharField(max_length=15)

    class Meta:
        model = User
        fields = ["first_name", "last_name", "mobile_number"]

    def validate_mobile_number(self, value):
        val = re.sub(r"\D", "", value)
        if len(val) < 10:
            raise serializers.ValidationError("Mobile number must be at least 10 digits.")
        if User.objects.filter(Q(username=val) | Q(mobile_number=val)).exists():
            raise serializers.ValidationError("A user with this mobile number already exists.")
        return val

    def create(self, validated_data):
        request = self.context.get("request")
        created_by = request.user if request and request.user.is_authenticated else None

        mobile = validated_data.pop("mobile_number")
        # System generates random 8-digit numeric password
        generated_password = f"{random.randint(10000000, 99999999)}"

        user = User.objects.create_user(
            username=mobile,
            mobile_number=mobile,
            password=generated_password,
            role=User.Role.DRIVER,
            approval_status=User.ApprovalStatus.APPROVED,
            is_active=True,
            created_by=created_by,
            must_change_password=True,
            **validated_data
        )
        user.employee_id = f"DRIV{user.id:05d}"
        user.save(update_fields=["employee_id"])

        user.generated_password = generated_password
        return user


class DriverListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    is_assigned = serializers.SerializerMethodField()
    assigned_truck_number = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "employee_id",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "mobile_number",
            "is_assigned",
            "assigned_truck_number",
            "must_change_password",
            "created_at",
        ]

    def get_is_assigned(self, obj):
        return obj.trucks.exists()

    def get_assigned_truck_number(self, obj):
        truck = obj.trucks.first()
        return truck.truck_number if truck else None


class AssignDriverSerializer(serializers.Serializer):

    driver_id = serializers.IntegerField()

    def validate_driver_id(self, value):

        try:
            driver = User.objects.get(
                id=value
            )
        except User.DoesNotExist:
            raise serializers.ValidationError(
                "Driver does not exist."
            )

        if driver.role != User.Role.DRIVER:
            raise serializers.ValidationError(
                "Selected user is not a driver."
            )

        if not driver.is_active:
            raise serializers.ValidationError(
                "Driver account is inactive."
            )

        if driver.approval_status != User.ApprovalStatus.APPROVED:
            raise serializers.ValidationError(
                "Driver account is not approved."
            )

        # Allow reassignment if already assigned to this exact truck, otherwise prevent
        truck_id = self.context.get("truck_id")
        existing_truck = driver.trucks.exclude(id=truck_id).first()
        if existing_truck:
            raise serializers.ValidationError(
                f"This driver is already assigned to truck {existing_truck.truck_number}."
            )

        return value
# ============================================================
# FUEL REQUEST SERIALIZER
# ============================================================

class FuelRequestSerializer(serializers.ModelSerializer):

    driver_name = serializers.CharField(
        source="driver.first_name",
        read_only=True
    )

    truck_number = serializers.CharField(
        source="truck.truck_number",
        read_only=True
    )

    customer_name = serializers.CharField(
        source="truck.customer.first_name",
        read_only=True
    )

    pump_name = serializers.CharField(
        source="pump.name",
        read_only=True
    )

    operator_name = serializers.CharField(
        source="operator.first_name",
        read_only=True
    )

    class Meta:
        model = FuelRequest

        fields = [
            "id",
            "request_number",

            "driver",
            "driver_name",

            "truck",
            "truck_number",
            "customer_name",

            "pump",
            "pump_name",

            "fuel_type",

            "requested_liters",
            "approved_liters",

            "operator",
            "operator_name",

            "status",
            "remarks",

            "created_at",
            "approved_at",
            "completed_at",
        ]

        read_only_fields = [
            "id",
            "request_number",

            "driver",
            "driver_name",

            "truck_number",
            "customer_name",
            "pump_name",

            "approved_liters",

            "operator",
            "operator_name",

            "status",

            "created_at",
            "approved_at",
            "completed_at",
        ]

# ============================================================
# VEHICLE VERIFICATION SERIALIZER
# ============================================================
class VehicleVerificationSerializer(serializers.ModelSerializer):

    verified_by_name = serializers.CharField(
        source="verified_by.first_name",
        read_only=True
    )

    class Meta:
        model = VehicleVerification

        fields = [
            "id",
            "fuel_request",
            "vehicle_image",

            "ocr_number",
            "manual_number",

            "verification_method",
            "status",

            "verified_by",
            "verified_by_name",

            "verified_at",
            "failure_reason",

            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",

            "ocr_number",
            "verification_method",
            "status",

            "verified_by",
            "verified_by_name",

            "verified_at",
            "failure_reason",

            "created_at",
            "updated_at",
        ]


# ============================================================
# LOGIN SERIALIZER
# ============================================================

ROLE_MAP = {
    "SUPER ADMIN": [User.Role.ADMIN],
    "SUPERADMIN": [User.Role.ADMIN],
    "ADMIN": [User.Role.ADMIN],
    "PUMP ADMIN": [User.Role.PUMP_ADMIN],
    "PUMPADMIN": [User.Role.PUMP_ADMIN],
    "PUMP OPERATOR": [User.Role.OPERATOR],
    "PUMPOPERATOR": [User.Role.OPERATOR],
    "OPERATOR": [User.Role.OPERATOR],
    "TRUCK OWNER": [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER],
    "TRUCKOWNER": [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER],
    "REGULAR CUSTOMER": [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER],
    "REGULARCUSTOMER": [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER],
    "DRIVER": [User.Role.DRIVER],
}


class LoginSerializers(serializers.Serializer):

    role = serializers.CharField(
        help_text="Role entered in CAPITAL LETTERS (SUPER ADMIN, PUMP ADMIN, PUMP OPERATOR, TRUCK OWNER, DRIVER)"
    )
    username = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Username or Mobile number"
    )
    mobile_number = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Mobile number or Username"
    )
    password = serializers.CharField(
        write_only=True
    )

    def validate(self, attrs):
        raw_role = attrs.get("role", "").strip()
        if not raw_role:
            raise serializers.ValidationError(
                {"role": "Role is required."}
            )

        # Requirement: User must enter role in CAPITAL LETTERS
        if raw_role != raw_role.upper():
            raise serializers.ValidationError(
                {"role": "Role must be entered in CAPITAL LETTERS (e.g. SUPER ADMIN, PUMP ADMIN, PUMP OPERATOR, TRUCK OWNER, DRIVER)."}
            )

        normalized_role = raw_role.upper()
        if normalized_role not in ROLE_MAP:
            raise serializers.ValidationError(
                {"role": f"Role '{raw_role}' is not supported. Supported roles: SUPER ADMIN, PUMP ADMIN, PUMP OPERATOR, TRUCK OWNER, DRIVER."}
            )

        identifier = (attrs.get("username") or attrs.get("mobile_number") or "").strip()
        password = attrs.get("password")

        if not identifier:
            raise serializers.ValidationError(
                {"username": "Username or Mobile Number is required."}
            )

        if not password:
            raise serializers.ValidationError(
                {"password": "Password is required."}
            )

        # Lookup user by username or mobile number (case-insensitive)
        user = User.objects.filter(
            Q(username__iexact=identifier) | Q(mobile_number__iexact=identifier)
        ).first()

        if not user or not user.check_password(password):
            raise serializers.ValidationError(
                "Invalid Username/Mobile number or Password."
            )

        if user.approval_status == User.ApprovalStatus.PENDING:
            raise serializers.ValidationError(
                "Your account is pending for admin verification."
            )

        if user.approval_status == User.ApprovalStatus.REJECTED:
            raise serializers.ValidationError(
                "Your registration has been rejected."
            )

        if not user.is_active:
            raise serializers.ValidationError(
                "Your account is inactive."
            )

        allowed_roles = ROLE_MAP[normalized_role]
        is_role_valid = False
        if normalized_role in ["SUPER ADMIN", "SUPERADMIN", "ADMIN"] and (user.role == User.Role.ADMIN or user.is_superuser):
            is_role_valid = True
        elif user.role in allowed_roles:
            is_role_valid = True

        if not is_role_valid:
            raise serializers.ValidationError(
                {"role": f"Entered role '{raw_role}' does not match your assigned account role."}
            )

        attrs["user"] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(
        min_length=6,
        write_only=True
    )

    def validate_new_password(self, value):
        if len(value) < 6:
            raise serializers.ValidationError("Password must be at least 6 characters long.")
        return value

# ============================================================
# CREATE FUEL REQUEST SERIALIZER
# ============================================================

class CreateFuelRequestSerializer(serializers.ModelSerializer):

    class Meta:
        model = FuelRequest

        fields = [
            "truck",
            "pump",
            "fuel_type",
            "requested_liters",
            "remarks",
        ]

    def validate(self, attrs):

        request = self.context["request"]
        driver = request.user

        truck = attrs["truck"]
        pump = attrs["pump"]
        fuel_type = attrs["fuel_type"]
        requested_liters = attrs["requested_liters"]

        # ----------------------------------------------------
        # Check logged-in user is DRIVER
        # ----------------------------------------------------

        if driver.role != User.Role.DRIVER:
            raise serializers.ValidationError(
                "Only a truck driver can create a fuel request."
            )

        # ----------------------------------------------------
        # Check driver account
        # ----------------------------------------------------

        if not driver.is_active:
            raise serializers.ValidationError(
                "Your account is inactive."
            )

        if driver.approval_status != User.ApprovalStatus.APPROVED:
            raise serializers.ValidationError(
                "Your account is not approved."
            )

        # ----------------------------------------------------
        # Check truck belongs to logged-in driver
        # ----------------------------------------------------

        if truck.driver_id != driver.id:
            raise serializers.ValidationError(
                "This truck is not assigned to you."
            )

        # ----------------------------------------------------
        # Check truck is active
        # ----------------------------------------------------

        if not truck.is_active:
            raise serializers.ValidationError(
                "This truck is inactive."
            )

        # ----------------------------------------------------
        # Check pump is active
        # ----------------------------------------------------

        if not pump.is_active:
            raise serializers.ValidationError(
                "This pump is inactive."
            )

        # ----------------------------------------------------
        # Check requested liters
        # ----------------------------------------------------

        if requested_liters <= 0:
            raise serializers.ValidationError(
                {
                    "requested_liters":
                    "Requested liters must be greater than 0."
                }
            )

        # ----------------------------------------------------
        # Check truck fuel type
        # ----------------------------------------------------

        if truck.fuel_type != fuel_type:
            raise serializers.ValidationError(
                {
                    "fuel_type":
                    f"This truck uses {truck.fuel_type}."
                }
            )

        # ----------------------------------------------------
        # Check truck capacity
        # ----------------------------------------------------

        if (
            truck.capacity_liters is not None
            and requested_liters > truck.capacity_liters
        ):
            raise serializers.ValidationError(
                {
                    "requested_liters":
                    f"Requested fuel cannot exceed truck "
                    f"capacity of {truck.capacity_liters} liters."
                }
            )

        return attrs

    def create(self, validated_data):

        request = self.context["request"]
        driver = request.user

        # Generate request number
        last_request = (
            FuelRequest.objects
            .order_by("-id")
            .first()
        )

        if last_request:
            next_id = last_request.id + 1
        else:
            next_id = 1

        request_number = f"FR{next_id:05d}"

        fuel_request = FuelRequest.objects.create(
            request_number=request_number,
            driver=driver,
            status=FuelRequest.Status.PENDING,
            approved_liters=None,
            operator=None,
            **validated_data
        )

        return fuel_request


class VehicleVerificationRequestSerializer(serializers.Serializer):

    vehicle_image = serializers.ImageField(
        required=True
    )