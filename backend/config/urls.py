"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from rest_framework_simplejwt.views import TokenRefreshView
from fuel.portal_views import (
    portal_login,
    portal_logout,
    portal_dashboard,
    portal_operator_reports,
    portal_operator_detail,
    portal_customer_reports,
    portal_customer_detail,
    portal_transactions,
    portal_pump_settings,
    portal_set_language,
)

urlpatterns = [
    # Default landing redirect
    path('', RedirectView.as_view(url='/portal/dashboard/', permanent=False)),

    # Admin Portal (Django Templates)
    path('portal/set-language/<str:lang>/', portal_set_language, name='portal-set-language'),
    path('portal/login/', portal_login, name='portal-login'),
    path('portal/logout/', portal_logout, name='portal-logout'),
    path('portal/', portal_dashboard, name='portal-home'),
    path('portal/dashboard/', portal_dashboard, name='portal-dashboard'),
    path('portal/settings/', portal_pump_settings, name='portal-settings'),
    path('portal/reports/operators/', portal_operator_reports, name='portal-operator-reports'),
    path('portal/reports/operators/<int:operator_id>/', portal_operator_detail, name='portal-operator-detail'),
    path('portal/reports/customers/', portal_customer_reports, name='portal-customer-reports'),
    path('portal/reports/customers/<int:customer_id>/', portal_customer_detail, name='portal-customer-detail'),
    path('portal/reports/transactions/', portal_transactions, name='portal-transactions'),

    # Django Admin & APIs
    path('admin/', admin.site.urls),
    path('api/', include("fuel.urls")),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    # Favicon direct handler
    path('favicon.ico', RedirectView.as_view(url='/static/images/icon.png', permanent=False)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.BASE_DIR / 'static')
