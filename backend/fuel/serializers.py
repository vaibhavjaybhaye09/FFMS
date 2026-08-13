from rest_framework import serializers
from django.contrib.auth import authenticate, get_user_model
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
# REGISTER SERIALIZER
# ============================================================

class RegisterSerializer(serializers.ModelSerializer):

    mobile_number = serializers.CharField(
        validators=[
            UniqueValidator(
                queryset=User.objects.all(),
                message="A user with this mobile number already exists."
            )
        ]
    )

    class Meta:
        model = User

        fields = [
            "mobile_number",
            "password",
            "first_name",
            "role",
        ]

        extra_kwargs = {
            "password": {
                "write_only": True
            }
        }

    def validate_role(self, value):

        allowed_roles = [
            User.Role.DRIVER,
            User.Role.OPERATOR,
        ]

        if value not in allowed_roles:
            raise serializers.ValidationError(
                "You can register only as DRIVER or OPERATOR."
            )

        return value

    def create(self, validated_data):

        # User is created as PENDING and INACTIVE
        # according to the User model defaults.
        return User.objects.create_user(
            **validated_data
        )


# ============================================================
# USER SERIALIZER
# ============================================================

class UserSerializer(serializers.ModelSerializer):

    class Meta:
        model = User

        fields = [
            "id",
            "employee_id",
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
# TRUCK SERIALIZER
# ============================================================

class TruckSerializer(serializers.ModelSerializer):

    driver_name = serializers.CharField(
        source="driver.first_name",
        read_only=True
    )

    class Meta:
        model = Truck

        fields = [
            "id",
            "truck_number",
            "driver",
            "driver_name",
            "fuel_type",
            "capacity_liters",
            "is_active",
        ]

        read_only_fields = [
            "id",
            "driver_name",
        ]

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

        # Driver already assigned to another truck
        if driver.trucks.exists():
            raise serializers.ValidationError(
                "This driver is already assigned to another truck."
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
class LoginSerializers(serializers.Serializer):

    mobile_number = serializers.CharField()

    password = serializers.CharField(
        write_only=True
    )

    def validate(self, attrs):

        mobile_number = attrs.get("mobile_number")
        password = attrs.get("password")

        # Authenticate using mobile number because
        # USERNAME_FIELD = "mobile_number"
        user = authenticate(
            username=str(mobile_number),
            password=password
        )

        # Invalid credentials
        if not user:
            raise serializers.ValidationError(
                "Invalid Mobile number or Password."
            )

        # Registration is waiting for admin approval
        if user.approval_status == User.ApprovalStatus.PENDING:
            raise serializers.ValidationError(
                "Your account is pending for admin verification."
            )

        # Admin rejected registration
        if user.approval_status == User.ApprovalStatus.REJECTED:
            raise serializers.ValidationError(
                "Your registration has been rejected."
            )

        # Extra safety check
        if not user.is_active:
            raise serializers.ValidationError(
                "Your account is inactive."
            )

        attrs["user"] = user

        return attrs

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