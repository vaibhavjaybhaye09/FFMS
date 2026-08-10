from django.urls import path
from .views import LoginAPIView, RegistraionAPIView


urlpatterns=[
    path("register/", RegistraionAPIView.as_view(),name="register"),
    path("login/", LoginAPIView.as_view(), name="login"),
]