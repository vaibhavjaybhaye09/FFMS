from rest_framework import serializers
from django.contrib.auth import authenticate, get_user_model
from rest_framework.validators import UniqueValidator

from .models import (
    User,
    Pump,
    Truck,
    FuelRequest,
    VehicleVerification,
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