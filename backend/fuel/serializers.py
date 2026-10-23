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
            "logo",
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
            plain_password=password,
            role=User.Role.TRUCK_OWNER,
            approval_status=User.ApprovalStatus.APPROVED,
            is_active=True,
            created_by=created_by,
            pump=pump,
            must_change_password=True,
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
    password = serializers.SerializerMethodField()

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
            "password",
            "role",
            "approval_status",
            "is_active",
            "trucks_count",
            "must_change_password",
            "created_at",
        ]

    def get_password(self, obj):
        if getattr(obj, "must_change_password", False) and getattr(obj, "plain_password", None):
            return obj.plain_password
        return None

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
            plain_password=generated_password,
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
    password = serializers.SerializerMethodField()

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
            "password",
            "is_active",
            "pump_name",
            "pump_code",
            "must_change_password",
            "created_at",
        ]

    def get_password(self, obj):
        if getattr(obj, "must_change_password", False) and getattr(obj, "plain_password", None):
            return obj.plain_password
        return None

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
    customer_name = serializers.SerializerMethodField()
    customer_mobile = serializers.SerializerMethodField()
    driver_name = serializers.SerializerMethodField()
    driver_mobile = serializers.SerializerMethodField()
    has_active_request = serializers.SerializerMethodField()
    active_request_id = serializers.SerializerMethodField()
    active_request_number = serializers.SerializerMethodField()
    active_request_status = serializers.SerializerMethodField()
    is_eligible_for_request = serializers.SerializerMethodField()

    class Meta:
        model = Truck
        fields = [
            "id",
            "truck_number",
            "customer",
            "customer_name",
            "customer_mobile",
            "driver",
            "driver_name",
            "driver_mobile",
            "fuel_type",
            "capacity_liters",
            "is_active",
            "has_active_request",
            "active_request_id",
            "active_request_number",
            "active_request_status",
            "is_eligible_for_request",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "customer",
            "customer_name",
            "customer_mobile",
            "driver_name",
            "driver_mobile",
            "has_active_request",
            "active_request_id",
            "active_request_number",
            "active_request_status",
            "is_eligible_for_request",
            "created_at",
        ]

    def _get_active_req(self, obj):
        if not hasattr(obj, "_cached_active_req"):
            obj._cached_active_req = obj.fuel_requests.filter(
                status__in=[
                    FuelRequest.Status.PENDING,
                    FuelRequest.Status.APPROVED,
                    FuelRequest.Status.VERIFIED,
                ]
            ).order_by("-created_at").first()
        return obj._cached_active_req

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.get_full_name() or obj.customer.username
        return None

    def get_customer_mobile(self, obj):
        if obj.customer:
            return obj.customer.mobile_number
        return None

    def get_driver_name(self, obj):
        if obj.driver:
            return obj.driver.get_full_name() or obj.driver.username
        return None

    def get_driver_mobile(self, obj):
        if obj.driver:
            return obj.driver.mobile_number
        return None

    def get_has_active_request(self, obj):
        return self._get_active_req(obj) is not None

    def get_active_request_id(self, obj):
        req = self._get_active_req(obj)
        return req.id if req else None

    def get_active_request_number(self, obj):
        req = self._get_active_req(obj)
        return req.request_number if req else None

    def get_active_request_status(self, obj):
        req = self._get_active_req(obj)
        return req.status if req else None

    def get_is_eligible_for_request(self, obj):
        return bool(obj.is_active and not self.get_has_active_request(obj))


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
            plain_password=generated_password,
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
    password = serializers.SerializerMethodField()

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
            "password",
            "is_active",
            "is_assigned",
            "assigned_truck_number",
            "must_change_password",
            "created_at",
        ]

    def get_password(self, obj):
        if getattr(obj, "must_change_password", False) and getattr(obj, "plain_password", None):
            return obj.plain_password
        return None

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
    driver_name = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    customer_mobile = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    created_by_role = serializers.SerializerMethodField()
    truck_number = serializers.CharField(source="truck.truck_number", read_only=True)
    pump_name = serializers.CharField(source="pump.name", read_only=True)
    pump_code = serializers.CharField(source="pump.code", read_only=True)
    operator_name = serializers.CharField(source="operator.first_name", read_only=True)

    class Meta:
        model = FuelRequest
        fields = [
            "id",
            "request_number",
            "created_by",
            "created_by_name",
            "created_by_role",
            "driver",
            "driver_name",
            "truck",
            "truck_number",
            "customer_name",
            "customer_mobile",
            "pump",
            "pump_name",
            "pump_code",
            "fuel_type",
            "requested_liters",
            "approved_liters",
            "operator",
            "operator_name",
            "dispenser_reading_image",
            "vehicle_plate_image",
            "status",
            "remarks",
            "created_at",
            "approved_at",
            "completed_at",
        ]
        read_only_fields = [
            "id",
            "request_number",
            "created_by",
            "created_by_name",
            "created_by_role",
            "driver",
            "driver_name",
            "truck_number",
            "customer_name",
            "customer_mobile",
            "pump_name",
            "pump_code",
            "approved_liters",
            "operator",
            "operator_name",
            "status",
            "created_at",
            "approved_at",
            "completed_at",
        ]

    def get_customer_name(self, obj):
        if obj.truck and obj.truck.customer:
            return obj.truck.customer.get_full_name() or obj.truck.customer.username
        return None

    def get_customer_mobile(self, obj):
        if obj.truck and obj.truck.customer:
            return obj.truck.customer.mobile_number
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        if obj.driver:
            return obj.driver.get_full_name() or obj.driver.username
        return None

    def get_created_by_role(self, obj):
        if obj.created_by:
            return obj.created_by.role
        return None

    def get_driver_name(self, obj):
        if obj.driver:
            return obj.driver.get_full_name() or obj.driver.username
        return None

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
}


class LoginSerializers(serializers.Serializer):

    role = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Optional role. If omitted, user role is automatically identified from their account."
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

        # If a role was optionally passed, verify it matches the user's role
        raw_role = (attrs.get("role") or "").strip()
        if raw_role:
            normalized_role = raw_role.upper()
            if normalized_role in ROLE_MAP:
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
# CREATE FUEL REQUEST SERIALIZER (SINGLE & BULK)
# ============================================================

class CreateFuelRequestSerializer(serializers.ModelSerializer):
    pump = serializers.PrimaryKeyRelatedField(
        queryset=Pump.objects.filter(is_active=True),
        required=False,
        allow_null=True
    )
    fuel_type = serializers.CharField(required=False, allow_blank=True)

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
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        user = request.user

        truck = attrs.get("truck")
        pump = attrs.get("pump")
        fuel_type = attrs.get("fuel_type")
        requested_liters = attrs.get("requested_liters")

        if not user.is_active:
            raise serializers.ValidationError("Your account is inactive.")

        if user.approval_status != User.ApprovalStatus.APPROVED:
            raise serializers.ValidationError("Your account is not approved.")

        # ----------------------------------------------------
        # Role Validation: Truck Owner or Pump Admin
        # ----------------------------------------------------
        if user.role in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
            # Truck Owner must own the truck
            if truck.customer_id != user.id:
                raise serializers.ValidationError(
                    {"truck": "This truck does not belong to your fleet."}
                )
            # Default pump to user's assigned pump or active pump if omitted
            if not pump:
                pump = user.pump or Pump.objects.filter(is_active=True).first()
                if not pump:
                    raise serializers.ValidationError(
                        {"pump": "No active pump station found. Please specify a pump."}
                    )
                attrs["pump"] = pump

        elif user.role in [User.Role.PUMP_ADMIN, User.Role.ADMIN]:
            # Pump Admin can only create single requests using owner-added trucks
            if not truck.customer:
                raise serializers.ValidationError(
                    {"truck": "This truck is not registered to any Truck Owner."}
                )
            if not pump:
                pump = (
                    Pump.objects.filter(pump_admin=user, is_active=True).first()
                    or user.pump
                    or Pump.objects.filter(is_active=True).first()
                )
                if not pump:
                    raise serializers.ValidationError(
                        {"pump": "No active pump station available."}
                    )
                attrs["pump"] = pump
        else:
            raise serializers.ValidationError(
                "Only Truck Owners and Pump Admins can create fuel requests."
            )

        if not truck.is_active:
            raise serializers.ValidationError(
                {"truck": f"Truck {truck.truck_number} is currently marked inactive."}
            )

        if not pump.is_active:
            raise serializers.ValidationError(
                {"pump": "Selected pump station is inactive."}
            )

        # ----------------------------------------------------
        # Duplicate Request Prevention: No active pending/approved request
        # ----------------------------------------------------
        active_request = FuelRequest.objects.filter(
            truck=truck,
            status__in=[
                FuelRequest.Status.PENDING,
                FuelRequest.Status.APPROVED,
                FuelRequest.Status.VERIFIED,
            ]
        ).first()

        if active_request:
            raise serializers.ValidationError(
                f"Truck '{truck.truck_number}' already has an active fuel request "
                f"({active_request.request_number} - {active_request.status}). "
                f"Duplicate requests are not permitted until the active request is completed."
            )

        # ----------------------------------------------------
        # Fuel Type & Capacity Validation
        # ----------------------------------------------------
        if not fuel_type:
            fuel_type = truck.fuel_type
            attrs["fuel_type"] = fuel_type
        elif truck.fuel_type != fuel_type:
            raise serializers.ValidationError(
                {"fuel_type": f"This truck uses {truck.fuel_type}."}
            )

        if requested_liters <= 0:
            raise serializers.ValidationError(
                {"requested_liters": "Requested liters must be greater than 0."}
            )

        if truck.capacity_liters is not None and requested_liters > truck.capacity_liters:
            raise serializers.ValidationError(
                {
                    "requested_liters": (
                        f"Requested fuel ({requested_liters}L) exceeds truck "
                        f"capacity of {truck.capacity_liters}L."
                    )
                }
            )

        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        user = request.user

        last_request = FuelRequest.objects.order_by("-id").first()
        next_id = (last_request.id + 1) if last_request else 1
        request_number = f"FR{next_id:05d}"

        fuel_request = FuelRequest.objects.create(
            request_number=request_number,
            created_by=user,
            driver=None,
            status=FuelRequest.Status.PENDING,
            approved_liters=None,
            operator=None,
            **validated_data
        )
        return fuel_request


class BulkFuelRequestItemSerializer(serializers.Serializer):
    truck_id = serializers.IntegerField()
    requested_liters = serializers.DecimalField(
        max_digits=6, decimal_places=2, required=False, allow_null=True
    )
    fuel_type = serializers.CharField(max_length=10, required=False, allow_blank=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class BulkFuelRequestCreateSerializer(serializers.Serializer):
    pump_id = serializers.IntegerField(required=False, allow_null=True)
    requests = BulkFuelRequestItemSerializer(many=True)

    def validate(self, attrs):
        request = self.context.get("request")
        user = request.user

        if user.role not in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER, User.Role.ADMIN]:
            raise serializers.ValidationError(
                "Only Truck Owners can create bulk fuel requests. Pump Admins may only create single truck requests."
            )

        items = attrs.get("requests", [])
        if not items:
            raise serializers.ValidationError(
                {"requests": "Please select at least one truck for bulk request."}
            )

        pump_id = attrs.get("pump_id")
        pump = None
        if pump_id:
            pump = Pump.objects.filter(id=pump_id, is_active=True).first()
            if not pump:
                raise serializers.ValidationError({"pump_id": "Invalid or inactive pump station."})
        elif user.pump:
            pump = user.pump
        else:
            pump = Pump.objects.filter(is_active=True).first()

        if not pump:
            raise serializers.ValidationError("No active pump station found.")
        attrs["pump"] = pump

        truck_ids = [item["truck_id"] for item in items]
        if len(truck_ids) != len(set(truck_ids)):
            raise serializers.ValidationError("Duplicate truck IDs found in selection list.")

        trucks = Truck.objects.filter(id__in=truck_ids)
        truck_map = {t.id: t for t in trucks}

        validated_items = []
        errors = []

        for item in items:
            t_id = item["truck_id"]
            truck = truck_map.get(t_id)
            if not truck:
                errors.append(f"Truck ID {t_id} does not exist.")
                continue

            # Ensure truck belongs to this Truck Owner
            if user.role in [User.Role.TRUCK_OWNER, User.Role.REGULAR_CUSTOMER]:
                if truck.customer_id != user.id:
                    errors.append(f"Truck {truck.truck_number} does not belong to your fleet.")
                    continue

            if not truck.is_active:
                errors.append(f"Truck {truck.truck_number} is marked inactive.")
                continue

            # Prevent duplicate active requests
            active_req = FuelRequest.objects.filter(
                truck=truck,
                status__in=[
                    FuelRequest.Status.PENDING,
                    FuelRequest.Status.APPROVED,
                    FuelRequest.Status.VERIFIED,
                ]
            ).first()

            if active_req:
                errors.append(
                    f"Truck {truck.truck_number} already has an active request "
                    f"({active_req.request_number} - {active_req.status})."
                )
                continue

            liters = item.get("requested_liters")
            if liters is None or liters <= 0:
                liters = truck.capacity_liters or 100

            if truck.capacity_liters is not None and liters > truck.capacity_liters:
                errors.append(
                    f"Truck {truck.truck_number} requested liters ({liters}L) "
                    f"exceeds tank capacity ({truck.capacity_liters}L)."
                )
                continue

            fuel_type = item.get("fuel_type") or truck.fuel_type

            validated_items.append({
                "truck": truck,
                "requested_liters": liters,
                "fuel_type": fuel_type,
                "remarks": item.get("remarks", "") or "Bulk fleet request",
            })

        if errors:
            raise serializers.ValidationError({"errors": errors})

        attrs["validated_items"] = validated_items
        return attrs

    def create(self, validated_data):
        from django.db import transaction
        request = self.context.get("request")
        user = request.user
        pump = validated_data["pump"]
        items = validated_data["validated_items"]

        created_requests = []
        with transaction.atomic():
            last_request = (
                FuelRequest.objects
                .select_for_update()
                .order_by("-id")
                .first()
            )
            current_id = last_request.id if last_request else 0

            for item in items:
                current_id += 1
                req_num = f"FR{current_id:05d}"
                req = FuelRequest.objects.create(
                    request_number=req_num,
                    created_by=user,
                    driver=None,
                    truck=item["truck"],
                    pump=pump,
                    fuel_type=item["fuel_type"],
                    requested_liters=item["requested_liters"],
                    remarks=item["remarks"],
                    status=FuelRequest.Status.PENDING,
                )
                created_requests.append(req)

        return created_requests


class VehicleVerificationRequestSerializer(serializers.Serializer):

    vehicle_image = serializers.ImageField(
        required=True
    )