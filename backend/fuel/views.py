from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from .serializers import LoginSerializers, RegisterSerializer, TruckSerializer, PumpSerializer, AssignDriverSerializer, AssignOperatorSerializer, CreateFuelRequestSerializer, FuelRequestSerializer, VehicleVerificationSerializer, VehicleVerificationRequestSerializer
from .ocr import extract_number_plate, normalize_plate_number
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.decorators import api_view
from .models import User, Pump, Truck, PumpOperator, VehicleVerification, FuelRequest
from django.shortcuts import get_object_or_404
from django.utils import timezone

class RegistraionAPIView(APIView):
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response({
            "message":(
                "Registration successful. "
                "Your account is under verificaiton"
            ),
            "user":{
                "id":user.id,
                "name":user.first_name,
                "mobile_number":user.mobile_number,
                "requested_role":user.role,
                "approval_status":user.approval_status,

            }
        }, 
        status =status.HTTP_201_CREATED
        )
    
class LoginAPIView(APIView):
    def post(self, request):
        serializer = LoginSerializers(data= request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "message": "Login Successful",
                "user": {
                    "id": user.id,
                    "employee_id": user.employee_id,
                    "name": user.get_full_name(),
                    "role": user.role,
                },
                "tokens": {
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                },
            },
            status=status.HTTP_200_OK,
        )
    
class LogoutAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    def post(self,request):
        try :
            refresh_token = request.data.get("refresh")
            if not refresh_token:
                return Response({"error": "Refresh token is required."},
                                status=status.HTTP_400_BAD_REQUEST,
                                )
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"message":"Logout succesful."},
                            status=status.HTTP_205_RESET_CONTENT,
                            )
        except TokenError:
            return Response({"error":"Invalid or expired refresh token."},
                            status=status.HTPP_400_BAD_REQUEST,
                            )

class TruckCreateAPIView(APIView):

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):

        # Only ADMIN can create truck
        if request.user.role != User.Role.ADMIN:
            return Response(
                {
                    "error": "Only admin can create a truck."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = TruckSerializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        truck = serializer.save()

        return Response(
            {
                "message": "Truck created successfully.",
                "truck": TruckSerializer(truck).data
            },
            status=status.HTTP_201_CREATED
        )

class PumpCreateAPIView(APIView):

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):

        # Only ADMIN can create pump
        if request.user.role != User.Role.ADMIN:
            return Response(
                {
                    "error": "Only admin can create a pump."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = PumpSerializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        pump = serializer.save()

        return Response(
            {
                "message": "Pump created successfully.",
                "pump": PumpSerializer(pump).data
            },
            status=status.HTTP_201_CREATED
        )
  
class AssignOperatorToPumpAPIView(APIView):

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, pump_id):

        # Only ADMIN can assign operators
        if request.user.role != User.Role.ADMIN:
            return Response(
                {
                    "error": "Only admin can assign an operator."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        pump = get_object_or_404(
            Pump,
            id=pump_id
        )

        serializer = AssignOperatorSerializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        operator_id = serializer.validated_data[
            "operator_id"
        ]

        operator = get_object_or_404(
            User,
            id=operator_id
        )

        PumpOperator.objects.create(
            pump=pump,
            operator=operator
        )

        return Response(
            {
                "message": "Operator assigned successfully.",
                "pump": {
                    "id": pump.id,
                    "name": pump.name,
                    "code": pump.code,
                },
                "operator": {
                    "id": operator.id,
                    "name": operator.get_full_name(),
                    "mobile_number": operator.mobile_number,
                }
            },
            status=status.HTTP_201_CREATED
        )
    
class AssignDriverToTruckAPIView(APIView):

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, truck_id):

        # Only ADMIN can assign driver
        if request.user.role != User.Role.ADMIN:
            return Response(
                {
                    "error": "Only admin can assign a driver."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        truck = get_object_or_404(
            Truck,
            id=truck_id
        )

        serializer = AssignDriverSerializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        driver_id = serializer.validated_data[
            "driver_id"
        ]

        driver = get_object_or_404(
            User,
            id=driver_id
        )

        truck.driver = driver
        truck.save(
            update_fields=[
                "driver",
                "updated_at"
            ]
        )

        return Response(
            {
                "message": "Driver assigned successfully.",
                "truck": {
                    "id": truck.id,
                    "truck_number": truck.truck_number,
                },
                "driver": {
                    "id": driver.id,
                    "name": driver.get_full_name(),
                    "mobile_number": driver.mobile_number,
                }
            },
            status=status.HTTP_200_OK
        )

# ============================================================
# CREATE FUEL REQUEST
class CreateFuelRequestAPIView(APIView):

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):

        serializer = CreateFuelRequestSerializer(
            data=request.data,
            context={
                "request": request
            }
        )

        serializer.is_valid(
            raise_exception=True
        )

        fuel_request = serializer.save()

        return Response(
            {
                "message": (
                    "Fuel request created successfully. "
                    "Waiting for operator approval."
                ),
                "fuel_request": FuelRequestSerializer(
                    fuel_request
                ).data
            },
            status=status.HTTP_201_CREATED
        )

class VerifyFuelRequestVehicleAPIView(APIView):

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, fuel_request_id):

        # ====================================================
        # 1. CHECK OPERATOR
        # ====================================================

        if request.user.role != User.Role.OPERATOR:
            return Response(
                {
                    "error": "Only pump operators can verify a vehicle."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        operator = request.user

        # ====================================================
        # 2. GET FUEL REQUEST
        # ====================================================

        fuel_request = get_object_or_404(
            FuelRequest,
            id=fuel_request_id
        )

        # ====================================================
        # 3. REQUEST MUST BE PENDING
        # ====================================================

        if fuel_request.status != FuelRequest.Status.PENDING:

            return Response(
                {
                    "error": (
                        "This fuel request is not available "
                        "for verification."
                    ),
                    "status": fuel_request.status,
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # ====================================================
        # 4. CHECK PUMP OPERATOR
        # ====================================================

        # Current Pump model has ONE operator ForeignKey.
        if fuel_request.pump.operator_id != operator.id:

            return Response(
                {
                    "error": (
                        "You are not assigned to this pump."
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        # ====================================================
        # 5. VALIDATE IMAGE
        # ====================================================

        serializer = VehicleVerificationRequestSerializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        image = serializer.validated_data[
            "vehicle_image"
        ]

        # ====================================================
        # 6. GET OR CREATE VERIFICATION
        # ====================================================

        verification, created = (
            VehicleVerification.objects.get_or_create(
                fuel_request=fuel_request
            )
        )

        # Store latest image
        verification.vehicle_image = image
        verification.verified_by = operator
        verification.verification_method = (
            VehicleVerification.VerificationMethod.OCR
        )
        verification.status = (
            VehicleVerification.VerificationStatus.PENDING
        )
        verification.failure_reason = ""

        verification.save()

        # ====================================================
        # 7. OCR
        # ====================================================

        try:

            ocr_number = extract_number_plate(
                image
            )

        except Exception as exc:

            verification.status = (
                VehicleVerification.VerificationStatus.PENDING
            )

            verification.verification_method = None
            verification.ocr_number = None

            verification.failure_reason = (
                "OCR processing failed."
            )

            verification.save()

            return Response(
                {
                    "status": "MANUAL_REQUIRED",
                    "message": (
                        "Number plate could not be read "
                        "automatically. Manual verification "
                        "is required."
                    ),
                    "fuel_request_id": fuel_request.id,
                    "request_number": (
                        fuel_request.request_number
                    ),
                    "manual_verification_allowed": True,
                },
                status=status.HTTP_200_OK
            )

        # ====================================================
        # 8. OCR DID NOT FIND NUMBER
        # ====================================================

        if not ocr_number:

            verification.status = (
                VehicleVerification.VerificationStatus.PENDING
            )

            verification.verification_method = None
            verification.ocr_number = None

            verification.failure_reason = (
                "OCR could not detect a vehicle number."
            )

            verification.save()

            return Response(
                {
                    "status": "MANUAL_REQUIRED",
                    "message": (
                        "OCR could not read the vehicle "
                        "number plate. Manual verification "
                        "is required."
                    ),
                    "fuel_request_id": fuel_request.id,
                    "request_number": (
                        fuel_request.request_number
                    ),
                    "manual_verification_allowed": True,
                },
                status=status.HTTP_200_OK
            )

        # ====================================================
        # 9. SAVE OCR RESULT
        # ====================================================

        expected_number = normalize_plate_number(
            fuel_request.truck.truck_number
        )

        detected_number = normalize_plate_number(
            ocr_number
        )

        verification.ocr_number = detected_number
        verification.verification_method = (
            VehicleVerification.VerificationMethod.OCR
        )

        # ====================================================
        # 10. COMPARE NUMBER
        # ====================================================

        if detected_number != expected_number:

            # OCR successfully worked,
            # but detected vehicle is wrong.

            verification.status = (
                VehicleVerification.VerificationStatus.FAILED
            )

            verification.failure_reason = (
                f"Vehicle number mismatch. "
                f"Expected {expected_number}, "
                f"detected {detected_number}."
            )

            verification.save()

            # IMPORTANT:
            # FuelRequest remains PENDING so the operator
            # can capture another image and retry.

            return Response(
                {
                    "status": "FAILED",
                    "message": (
                        "Vehicle number does not match "
                        "the truck assigned to this request."
                    ),
                    "expected_number": expected_number,
                    "ocr_number": detected_number,
                    "retry_allowed": True,
                    "manual_verification_allowed": False,
                },
                status=status.HTTP_200_OK
            )

        # ====================================================
        # 11. NUMBER MATCHED
        # ====================================================

        verification.status = (
            VehicleVerification.VerificationStatus.VERIFIED
        )

        verification.verified_at = timezone.now()
        verification.failure_reason = ""

        verification.save()

        # ====================================================
        # 12. APPROVE FUEL REQUEST
        # ====================================================

        fuel_request.operator = operator

        fuel_request.approved_liters = (
            fuel_request.requested_liters
        )

        fuel_request.status = (
            FuelRequest.Status.APPROVED
        )

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

        # ====================================================
        # 13. RESPONSE
        # ====================================================

        return Response(
            {
                "status": "APPROVED",
                "message": (
                    "Vehicle verified successfully "
                    "and fuel request approved."
                ),
                "fuel_request_id": fuel_request.id,
                "request_number": (
                    fuel_request.request_number
                ),
                "vehicle": {
                    "expected_number": expected_number,
                    "ocr_number": detected_number,
                },
                "verification": (
                    VehicleVerificationSerializer(
                        verification
                    ).data
                ),
                "approved_liters": (
                    fuel_request.approved_liters
                ),
            },
            status=status.HTTP_200_OK
        )
    
class ManualVerifyFuelRequestAPIView(APIView):

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, fuel_request_id):

        # ====================================================
        # 1. CHECK OPERATOR
        # ====================================================

        if request.user.role != User.Role.OPERATOR:
            return Response(
                {
                    "error": "Only pump operators can verify a vehicle."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        operator = request.user

        # ====================================================
        # 2. GET REQUEST
        # ====================================================

        fuel_request = get_object_or_404(
            FuelRequest,
            id=fuel_request_id
        )

        # ====================================================
        # 3. REQUEST MUST BE PENDING
        # ====================================================

        if fuel_request.status != FuelRequest.Status.PENDING:

            return Response(
                {
                    "error": (
                        "This fuel request is not "
                        "available for verification."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # ====================================================
        # 4. CHECK PUMP OPERATOR
        # ====================================================

        if fuel_request.pump.operator_id != operator.id:

            return Response(
                {
                    "error": (
                        "You are not assigned to this pump."
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        # ====================================================
        # 5. GET VERIFICATION
        # ====================================================

        verification = get_object_or_404(
            VehicleVerification,
            fuel_request=fuel_request
        )

        # ====================================================
        # 6. MANUAL IS ALLOWED ONLY AFTER OCR FAILURE
        # ====================================================

        if verification.ocr_number:

            return Response(
                {
                    "error": (
                        "Manual verification is not allowed "
                        "because OCR successfully detected "
                        "a vehicle number. Retry the image "
                        "verification instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # ====================================================
        # 7. GET MANUAL NUMBER
        # ====================================================

        manual_number = request.data.get(
            "manual_number"
        )

        if not manual_number:

            return Response(
                {
                    "error": "manual_number is required."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        manual_number = normalize_plate_number(
            manual_number
        )

        expected_number = normalize_plate_number(
            fuel_request.truck.truck_number
        )

        # ====================================================
        # 8. COMPARE MANUAL NUMBER
        # ====================================================

        verification.manual_number = manual_number
        verification.verification_method = (
            VehicleVerification.VerificationMethod.MANUAL
        )

        # ----------------------------------------------------
        # MISMATCH
        # ----------------------------------------------------

        if manual_number != expected_number:

            verification.status = (
                VehicleVerification.VerificationStatus.FAILED
            )

            verification.failure_reason = (
                f"Manual vehicle number mismatch. "
                f"Expected {expected_number}, "
                f"entered {manual_number}."
            )

            verification.save()

            return Response(
                {
                    "status": "FAILED",
                    "message": (
                        "Manual vehicle number does not "
                        "match the requested truck."
                    ),
                    "expected_number": expected_number,
                    "manual_number": manual_number,
                    "retry_allowed": True,
                },
                status=status.HTTP_200_OK
            )

        # ====================================================
        # 9. MATCH
        # ====================================================

        verification.status = (
            VehicleVerification.VerificationStatus.VERIFIED
        )

        verification.verified_by = operator
        verification.verified_at = timezone.now()
        verification.failure_reason = ""

        verification.save()

        # ====================================================
        # 10. APPROVE REQUEST
        # ====================================================

        fuel_request.operator = operator

        fuel_request.approved_liters = (
            fuel_request.requested_liters
        )

        fuel_request.status = (
            FuelRequest.Status.APPROVED
        )

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
                "message": (
                    "Vehicle manually verified "
                    "and fuel request approved."
                ),
                "fuel_request_id": fuel_request.id,
                "request_number": (
                    fuel_request.request_number
                ),
                "verification": (
                    VehicleVerificationSerializer(
                        verification
                    ).data
                ),
            },
            status=status.HTTP_200_OK
        )


# ============================================================
# PUMP UPDATE
# ============================================================

class PumpUpdateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def put(self, request, pump_id):
        # Only ADMIN can update pump
        if request.user.role != User.Role.ADMIN:
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


# ============================================================
# PUMP DELETE
# ============================================================

class PumpDeleteAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, pump_id):
        # Only ADMIN can delete pump
        if request.user.role != User.Role.ADMIN:
            return Response(
                {"error": "Only admin can delete a pump."},
                status=status.HTTP_403_FORBIDDEN
            )

        pump = get_object_or_404(Pump, id=pump_id)
        pump_name = pump.name
        pump.delete()

        return Response(
            {
                "message": f"Pump '{pump_name}' deleted successfully."
            },
            status=status.HTTP_200_OK
        )


# ============================================================
# TRUCK UPDATE
# ============================================================

class TruckUpdateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def put(self, request, truck_id):
        # Only ADMIN can update truck
        if request.user.role != User.Role.ADMIN:
            return Response(
                {"error": "Only admin can update a truck."},
                status=status.HTTP_403_FORBIDDEN
            )

        truck = get_object_or_404(Truck, id=truck_id)
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


# ============================================================
# TRUCK DELETE
# ============================================================

class TruckDeleteAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, truck_id):
        # Only ADMIN can delete truck
        if request.user.role != User.Role.ADMIN:
            return Response(
                {"error": "Only admin can delete a truck."},
                status=status.HTTP_403_FORBIDDEN
            )

        truck = get_object_or_404(Truck, id=truck_id)
        truck_number = truck.truck_number
        truck.delete()

        return Response(
            {
                "message": f"Truck '{truck_number}' deleted successfully."
            },
            status=status.HTTP_200_OK
        )


# ============================================================
# FUEL REQUEST UPDATE
# ============================================================

class FuelRequestUpdateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def put(self, request, fuel_request_id):
        fuel_request = get_object_or_404(FuelRequest, id=fuel_request_id)

        # Driver can only update their own pending requests
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

        # Operator can update approval details
        elif request.user.role == User.Role.OPERATOR:
            if fuel_request.operator_id != request.user.id:
                return Response(
                    {"error": "You can only update requests assigned to you."},
                    status=status.HTTP_403_FORBIDDEN
                )

        # Admin can update anything
        elif request.user.role != User.Role.ADMIN:
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


# ============================================================
# FUEL REQUEST DELETE
# ============================================================

class FuelRequestDeleteAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, fuel_request_id):
        fuel_request = get_object_or_404(FuelRequest, id=fuel_request_id)

        # Driver can only delete their own pending requests
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

        # Only admin can delete approved/completed requests
        elif request.user.role != User.Role.ADMIN:
            return Response(
                {"error": "Only admin can delete fuel requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        request_number = fuel_request.request_number
        fuel_request.delete()

        return Response(
            {
                "message": f"Fuel request '{request_number}' deleted successfully."
            },
            status=status.HTTP_200_OK
        )