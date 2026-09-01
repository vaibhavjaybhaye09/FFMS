from django.urls import path
from .views import (
    LoginAPIView,
    RegistraionAPIView,
    LogoutAPIView,
    TruckCreateAPIView,
    TruckUpdateAPIView,
    TruckDeleteAPIView,
    PumpCreateAPIView,
    PumpUpdateAPIView,
    PumpDeleteAPIView,
    PumpListAPIView,
    MyPumpAPIView,
    MyTruckAPIView,
    MyFuelRequestsAPIView,
    AssignOperatorToPumpAPIView,
    AssignDriverToTruckAPIView,
    CreateFuelRequestAPIView,
    FuelRequestUpdateAPIView,
    FuelRequestDeleteAPIView,
    VerifyFuelRequestVehicleAPIView,
    ManualVerifyFuelRequestAPIView,
    OperatorPumpRequestsAPIView,
)

urlpatterns = [
    # Authentication endpoints
    path("register/", RegistraionAPIView.as_view(), name="register"),
    path("login/", LoginAPIView.as_view(), name="login"),
    path("logout/", LogoutAPIView.as_view(), name="logout"),
    
    # Pump endpoints
    path("my-pump/", MyPumpAPIView.as_view(), name="my-pump"),
    path("pumps/", PumpListAPIView.as_view(), name="pump-list"),
    path("pumps/create/", PumpCreateAPIView.as_view(), name="pump-create"),
    path("pumps/<int:pump_id>/update/", PumpUpdateAPIView.as_view(), name="pump-update"),
    path("pumps/<int:pump_id>/delete/", PumpDeleteAPIView.as_view(), name="pump-delete"),
    path("pumps/<int:pump_id>/assign-operator/", AssignOperatorToPumpAPIView.as_view(), name="pump-assign-operator"),
    
    # Truck endpoints
    path("my-truck/", MyTruckAPIView.as_view(), name="my-truck"),
    path("trucks/create/", TruckCreateAPIView.as_view(), name="truck-create"),
    path("trucks/<int:truck_id>/update/", TruckUpdateAPIView.as_view(), name="truck-update"),
    path("trucks/<int:truck_id>/delete/", TruckDeleteAPIView.as_view(), name="truck-delete"),
    path("trucks/<int:truck_id>/assign-driver/", AssignDriverToTruckAPIView.as_view(), name="truck-assign-driver"),
    
    # Fuel Request endpoints
    path("fuel-requests/mine/", MyFuelRequestsAPIView.as_view(), name="fuel-requests-mine"),
    path("fuel-requests/create/", CreateFuelRequestAPIView.as_view(), name="fuel-request-create"),
    path("fuel-requests/<int:fuel_request_id>/update/", FuelRequestUpdateAPIView.as_view(), name="fuel-request-update"),
    path("fuel-requests/<int:fuel_request_id>/delete/", FuelRequestDeleteAPIView.as_view(), name="fuel-request-delete"),
    path("fuel-requests/<int:fuel_request_id>/verify-vehicle/", VerifyFuelRequestVehicleAPIView.as_view(), name="fuel-request-verify-vehicle"),
    path("fuel-requests/<int:fuel_request_id>/manual-verify/", ManualVerifyFuelRequestAPIView.as_view(), name="fuel-request-manual-verify"),
    path("fuel-requests/operator-queue/", OperatorPumpRequestsAPIView.as_view(), name="fuel-requests-operator-queue"),
]