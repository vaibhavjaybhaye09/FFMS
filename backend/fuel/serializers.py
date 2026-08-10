from rest_framework import serializers
from django.contrib.auth import authenticate, get_user_model
from .models import User, Pump, Truck, FuelRequest, VehicleVerification
from rest_framework.validators import UniqueValidator


User = get_user_model()

class RegisterSerializer(serializers.ModelSerializer):
    mobile_number = serializers.CharField(
        validators=[UniqueValidator(queryset=User.objects.all(), message="A user with this mobile number already exists.")]
    )

    class Meta:
        model = User
        fields = ['mobile_number', 'password', 'username', 'first_name', 'role']

    def validate_mobile_number(self, value):
        if User.objects.filter(mobile_number_=value).exists():
            raise serializers.ValidationError("Mobile number is already registered.")
        return value
    def validate_role(self,value):
        allowed_roles =[
            User.Role.DRIVER,
            User.Role.OPERATOR,
        ]
        if value not in allowed_roles:
            raise serializers.ValidationError("Only Driver Or Operator registration is allowed.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")

        mobile_number =validated_data["Mobile_number"]
        user = user(
            username= f"user_{mobile_number}",
            **validated_data
        )
        user.set_password(password)
        user.approval_status =User.Approvalstatus.PENDING
        user.is_active = False
        user.save()
        return user

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields =["id", "employee_id", "first_name", "last_name", "mobile_number", "role",]
        read_only_fields = ["id", "role"]

class PumpSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pump
        fields = ["id", "name", "code","address","city", "contact_number","is_active" ]
        read_only_fields =["id"]

class TruckSerializer(serializers.ModelSerializer):
    driver_name = serializers.CharField(source ="driver.first_name", read_only =True)

    class Meta :
        model= Truck
        fields = ["id", "truck_number","driver", "driver_name", "fuel_type", "capacity_liters", "is_active",]
        read_only_fields = ["id", "driver_name"]


class FuelRequestSerializer(serializers.ModelSerializer):
    driver_name = serializers.CharField(source = "drive.first_name", read_only =True)
    class Meta:
        model =FuelRequest
        fields=["id","request_number","driver", "driver_name","truck","truck_number","pump","pump_name", "fuel_type", "request_liters","approved_litters", "operator_name", "status", "remarks","request_at", "approved_at", "competed_at", ]
        read_only_fields = ["id", "request_number","driver", "operator","approved_liters", "requested_at", "completed_at","driver_name", "truck_number","pump_name","operator_name", ]

class VichleVerificationSerializer(serializers.ModelSerializer):
    verified_by_name=serializers.CharField(source ="verified_by.first_name", read_only = True)
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


class LoginSerializers(serializers.Serializer):
    employee_id = serializers.CharField()
    password = serializers.CharField(write_only =True)

    def validate(self, attrs):
        employee_id= attrs.get("employee_id")
        password = attrs.get("password")

        user = authenticate(username = employee_id, password = password)
        if not user:
            raise serializers.ValidationError("Invalid employee ID or Password")
        if not user.is_active:
            raise serializers.ValidationError("Your account is inactive.")
        attrs["user"] = user
        return attrs
