from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import LoginSerializers


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