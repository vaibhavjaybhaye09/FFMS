from django.contrib import admin
from .models import User, Pump, Truck, FuelRequest, VehicleVerification


@admin.register(User)
class UserAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "employee_id",
        "first_name",
        "mobile_number",
        "role",
        "approval_status",
        "is_active",
        "created_at",
    )

    list_filter = (
        "approval_status",
        "role",
        "is_active",
    )

    search_fields = (
        "employee_id",
        "first_name",
        "last_name",
        "mobile_number",
    )

    readonly_fields = (
        "employee_id",
        "created_at",
        "updated_at",
    )

    actions = [
        "approve_users",
        "reject_users",
    ]

    fieldsets = (
        (
            "User Information",
            {
                "fields": (
                    "first_name",
                    "last_name",
                    "mobile_number",
                    "role",
                )
            },
        ),
        (
            "Registration Approval",
            {
                "fields": (
                    "employee_id",
                    "approval_status",
                    "is_active",
                )
            },
        ),
        (
            "System Information",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )

    def approve_users(self, request, queryset):

        for user in queryset:

            # Generate employee ID only when approving
            if not user.employee_id:
                user.employee_id = f"EMP{user.id:05d}"

            user.approval_status = User.ApprovalStatus.APPROVED
            user.is_active = True

            user.save(
                update_fields=[
                    "employee_id",
                    "approval_status",
                    "is_active",
                    "updated_at",
                ]
            )

        self.message_user(
            request,
            f"{queryset.count()} user(s) approved successfully."
        )

    approve_users.short_description = "Approve selected users"

    def reject_users(self, request, queryset):

        queryset.update(
            approval_status=User.ApprovalStatus.REJECTED,
            is_active=False,
        )

        self.message_user(
            request,
            f"{queryset.count()} user(s) rejected."
        )

    reject_users.short_description = "Reject selected users"


@admin.register(Pump)
class PumpAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "code",
        "name",
        "city",
        "operator",
        "is_active",
    )

    list_filter = (
        "is_active",
        "city",
    )

    search_fields = (
        "name",
        "code",
        "city",
    )


@admin.register(Truck)
class TruckAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "truck_number",
        "driver",
        "fuel_type",
        "capacity_liters",
        "is_active",
    )

    list_filter = (
        "fuel_type",
        "is_active",
    )

    search_fields = (
        "truck_number",
        "driver__first_name",
        "driver__mobile_number",
    )


@admin.register(FuelRequest)
class FuelRequestAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "request_number",
        "driver",
        "truck",
        "pump",
        "fuel_type",
        "status",
        "request_at",
    )

    list_filter = (
        "status",
        "fuel_type",
    )

    search_fields = (
        "request_number",
        "driver__first_name",
        "driver__mobile_number",
    )


@admin.register(VehicleVerification)
class VehicleVerificationAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "fuel_request",
        "status",
        "verification_method",
        "verified_by",
        "verified_at",
    )

    list_filter = (
        "status",
        "verification_method",
    )