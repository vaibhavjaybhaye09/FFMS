from django.urls import path
from .views import (
    LoginAPIView,
    LogoutAPIView,
    ChangePasswordAPIView,
    UserLanguageAPIView,
    SuperAdminPumpAdminCreateAPIView,
    SuperAdminPumpAdminListAPIView,
    PumpAdminMyPumpAPIView,
    PumpAdminCustomerCreateAPIView,
    PumpAdminCustomerListAPIView,
    PumpAdminOperatorCreateAPIView,
    PumpAdminOperatorListAPIView,
    PumpAdminOperatorStatusAPIView,
    PumpAdminOperatorDeleteAPIView,
    PumpAdminDashboardStatsAPIView,
    PumpAdminEligibleTrucksAPIView,
    PumpAdminFuelRequestsAPIView,
    CustomerTruckListCreateAPIView,
    CustomerDriverCreateAPIView,
    CustomerAvailableDriversAPIView,
    CustomerDriverStatusAPIView,
    CustomerDriverDeleteAPIView,
    CustomerFuelRequestsAPIView,
    CustomerDashboardStatsAPIView,
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
    BulkFuelRequestCreateAPIView,
    FuelRequestUpdateAPIView,
    FuelRequestDeleteAPIView,
    ApproveFuelRequestAPIView,
    RejectFuelRequestAPIView,
    CompleteFuelRequestAPIView,
    VerifyFuelRequestVehicleAPIView,
    ManualVerifyFuelRequestAPIView,
    OperatorPumpRequestsAPIView,
    OperatorCompletedRequestsAPIView,
)

urlpatterns = [
    # Authentication endpoints (No public register endpoint)
    path("login/", LoginAPIView.as_view(), name="login"),
    path("logout/", LogoutAPIView.as_view(), name="logout"),
    path("change-password/", ChangePasswordAPIView.as_view(), name="change-password"),
    path("user/language/", UserLanguageAPIView.as_view(), name="user-language"),
    
    # Super Admin endpoints
    path("admin/pump-admins/", SuperAdminPumpAdminListAPIView.as_view(), name="admin-pump-admin-list"),
    path("admin/pump-admins/create/", SuperAdminPumpAdminCreateAPIView.as_view(), name="admin-pump-admin-create"),

    # Pump Admin endpoints
    path("pump-admin/my-pump/", PumpAdminMyPumpAPIView.as_view(), name="pump-admin-my-pump"),
    path("pump-admin/customers/", PumpAdminCustomerListAPIView.as_view(), name="pump-admin-customer-list"),
    path("pump-admin/customers/create/", PumpAdminCustomerCreateAPIView.as_view(), name="pump-admin-customer-create"),
    path("pump-admin/operators/", PumpAdminOperatorListAPIView.as_view(), name="pump-admin-operator-list"),
    path("pump-admin/operators/create/", PumpAdminOperatorCreateAPIView.as_view(), name="pump-admin-operator-create"),
    path("pump-admin/operators/<int:operator_id>/status/", PumpAdminOperatorStatusAPIView.as_view(), name="pump-admin-operator-status"),
    path("pump-admin/operators/<int:operator_id>/delete/", PumpAdminOperatorDeleteAPIView.as_view(), name="pump-admin-operator-delete"),
    path("pump-admin/dashboard/", PumpAdminDashboardStatsAPIView.as_view(), name="pump-admin-dashboard"),
    path("pump-admin/eligible-trucks/", PumpAdminEligibleTrucksAPIView.as_view(), name="pump-admin-eligible-trucks"),
    path("pump-admin/fuel-requests/", PumpAdminFuelRequestsAPIView.as_view(), name="pump-admin-fuel-requests"),

    # Truck Owner (Customer) endpoints
    path("customer/trucks/", CustomerTruckListCreateAPIView.as_view(), name="customer-truck-list"),
    path("customer/trucks/create/", CustomerTruckListCreateAPIView.as_view(), name="customer-truck-create"),
    path("customer/drivers/", CustomerAvailableDriversAPIView.as_view(), name="customer-available-drivers"),
    path("customer/drivers/create/", CustomerDriverCreateAPIView.as_view(), name="customer-driver-create"),
    path("customer/drivers/<int:driver_id>/status/", CustomerDriverStatusAPIView.as_view(), name="customer-driver-status"),
    path("customer/drivers/<int:driver_id>/delete/", CustomerDriverDeleteAPIView.as_view(), name="customer-driver-delete"),
    path("customer/fuel-requests/", CustomerFuelRequestsAPIView.as_view(), name="customer-fuel-requests"),
    path("customer/fuel-requests/bulk-create/", BulkFuelRequestCreateAPIView.as_view(), name="customer-fuel-requests-bulk-create"),
    path("customer/dashboard/", CustomerDashboardStatsAPIView.as_view(), name="customer-dashboard"),

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
    path("fuel-requests/bulk-create/", BulkFuelRequestCreateAPIView.as_view(), name="fuel-request-bulk-create"),
    path("fuel-requests/<int:fuel_request_id>/update/", FuelRequestUpdateAPIView.as_view(), name="fuel-request-update"),
    path("fuel-requests/<int:fuel_request_id>/delete/", FuelRequestDeleteAPIView.as_view(), name="fuel-request-delete"),
    
    # Operator Fuel Approval Endpoints (Zero OCR)
    path("fuel-requests/<int:fuel_request_id>/approve/", ApproveFuelRequestAPIView.as_view(), name="fuel-request-approve"),
    path("fuel-requests/<int:fuel_request_id>/reject/", RejectFuelRequestAPIView.as_view(), name="fuel-request-reject"),
    path("fuel-requests/<int:fuel_request_id>/complete/", CompleteFuelRequestAPIView.as_view(), name="fuel-request-complete"),
    path("fuel-requests/operator-queue/", OperatorPumpRequestsAPIView.as_view(), name="fuel-requests-operator-queue"),
    path("fuel-requests/operator-completed/", OperatorCompletedRequestsAPIView.as_view(), name="fuel-requests-operator-completed"),

    # Legacy/compatibility aliases
    path("fuel-requests/<int:fuel_request_id>/verify-vehicle/", VerifyFuelRequestVehicleAPIView.as_view(), name="fuel-request-verify-vehicle"),
    path("fuel-requests/<int:fuel_request_id>/manual-verify/", ManualVerifyFuelRequestAPIView.as_view(), name="fuel-request-manual-verify"),
]