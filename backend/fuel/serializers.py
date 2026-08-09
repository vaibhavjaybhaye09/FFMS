from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import (User, Pump, Truck, FuelRequest, VechileVerificatoin, )

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
        model = VechileVerificatoin
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
