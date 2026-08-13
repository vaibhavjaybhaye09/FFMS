from django.urls import path
from .views import LoginAPIView, RegistraionAPIView, LogoutAPIView


urlpatterns=[
    path("register/", RegistraionAPIView.as_view(),name="register"),
    path("login/", LoginAPIView.as_view(), name="login"),
    path("logout/", LogoutAPIView.as_view(), name="logout")
]