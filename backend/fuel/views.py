from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import LoginSerializers, RegisterSerializer
from rest_framework.decorators import api_view




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
        return Response({
            "message":"Login Successful", 
            "user":{
                "id": user.id,
                "employee_id":user.employee_id,
                "name": user.get_full_name(),
                "role": user.role,
            },
            "tokens":{
                "refresh":str(refresh),
                "accees":str(refresh.access_token),

            },                        
        },
        status=status.HTTP_200_ok

    )