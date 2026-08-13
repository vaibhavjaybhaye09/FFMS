from django.contrib import admin
from .models import User, Pump, Truck, FuelRequest, VehicleVerification, PumpOperator


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
        "created_at",
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
        "password",
    )

    actions = [
        "approve_users",
        "reject_users",
        "activate_users",
        "deactivate_users",
    ]

    fieldsets = (
        (
            "User Information",
            {
                "fields": (
                    "first_name",
                    "last_name",
                    "mobile_number",
                    "password",
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
            "Admin Permissions",
            {
                "fields": (
                    "is_staff",
                    "is_superuser",
                ),
                "classes": ("collapse",),
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

    approve_users.short_description = "✓ Approve selected users"

    def reject_users(self, request, queryset):
        queryset.update(
            approval_status=User.ApprovalStatus.REJECTED,
            is_active=False,
        )

        self.message_user(
            request,
            f"{queryset.count()} user(s) rejected."
        )

    reject_users.short_description = "✗ Reject selected users"

    def activate_users(self, request, queryset):
        queryset.update(is_active=True)
        self.message_user(request, f"{queryset.count()} user(s) activated.")

    activate_users.short_description = "Activate selected users"

    def deactivate_users(self, request, queryset):
        queryset.update(is_active=False)
        self.message_user(request, f"{queryset.count()} user(s) deactivated.")

    deactivate_users.short_description = "Deactivate selected users"


class PumpOperatorInline(admin.TabularInline):
    model = PumpOperator
    extra = 1
    raw_id_fields = ("operator",)
    readonly_fields = ("assigned_at",)
    fields = ("operator", "assigned_at")
    verbose_name = "Operator"
    verbose_name_plural = "Operators"


@admin.register(Pump)
class PumpAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "code",
        "name",
        "city",
        "operators_count",
        "is_active",
        "created_at",
    )

    list_filter = (
        "is_active",
        "city",
        "created_at",
    )

    search_fields = (
        "name",
        "code",
        "city",
        "address",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )

    inlines = [
        PumpOperatorInline,
    ]

    fieldsets = (
        (
            "Pump Information",
            {
                "fields": (
                    "code",
                    "name",
                    "address",
                    "city",
                    "contact_number",
                )
            },
        ),
        (
            "Status",
            {
                "fields": ("is_active",)
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

    def operators_count(self, obj):
        return obj.operators.count()

    operators_count.short_description = "Operators"





@admin.register(PumpOperator)
class PumpOperatorAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "pump",
        "operator",
        "operator_mobile",
        "assigned_at",
    )

    list_filter = (
        "pump__city",
        "assigned_at",
    )

    search_fields = (
        "pump__name",
        "pump__code",
        "operator__first_name",
        "operator__mobile_number",
    )

    readonly_fields = (
        "assigned_at",
    )

    def operator_mobile(self, obj):
        return obj.operator.mobile_number

    operator_mobile.short_description = "Operator Mobile"


@admin.register(Truck)
class TruckAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "truck_number",
        "driver_name",
        "fuel_type",
        "capacity_liters",
        "is_active",
        "created_at",
    )

    list_filter = (
        "fuel_type",
        "is_active",
        "created_at",
    )

    search_fields = (
        "truck_number",
        "driver__first_name",
        "driver__mobile_number",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )

    fieldsets = (
        (
            "Truck Information",
            {
                "fields": (
                    "truck_number",
                    "driver",
                    "fuel_type",
                    "capacity_liters",
                )
            },
        ),
        (
            "Status",
            {
                "fields": ("is_active",)
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

    def driver_name(self, obj):
        if obj.driver:
            return obj.driver.get_full_name()
        return "—"

    driver_name.short_description = "Driver"


@admin.register(FuelRequest)
class FuelRequestAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "request_number",
        "driver_name",
        "truck",
        "pump",
        "fuel_type",
        "status",
        "requested_liters",
        "created_at",
    )

    list_filter = (
        "status",
        "fuel_type",
        "created_at",
        "approved_at",
    )

    search_fields = (
        "request_number",
        "driver__first_name",
        "driver__mobile_number",
        "truck__truck_number",
    )

    readonly_fields = (
        "request_number",
        "created_at",
        "updated_at",
        "approved_at",
        "completed_at",
    )

    fieldsets = (
        (
            "Request Information",
            {
                "fields": (
                    "request_number",
                    "driver",
                    "truck",
                    "pump",
                )
            },
        ),
        (
            "Fuel Details",
            {
                "fields": (
                    "fuel_type",
                    "requested_liters",
                    "approved_liters",
                )
            },
        ),
        (
            "Approval & Completion",
            {
                "fields": (
                    "status",
                    "operator",
                    "remarks",
                )
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                    "approved_at",
                    "completed_at",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    actions = [
        "mark_approved",
        "mark_verified",
        "mark_completed",
    ]

    def driver_name(self, obj):
        return obj.driver.get_full_name()

    driver_name.short_description = "Driver"

    def mark_approved(self, request, queryset):
        count = queryset.update(status=FuelRequest.Status.APPROVED)
        self.message_user(request, f"{count} request(s) marked as approved.")

    mark_approved.short_description = "Mark selected as APPROVED"

    def mark_verified(self, request, queryset):
        count = queryset.update(status=FuelRequest.Status.VERIFIED)
        self.message_user(request, f"{count} request(s) marked as verified.")

    mark_verified.short_description = "Mark selected as VERIFIED"

    def mark_completed(self, request, queryset):
        count = queryset.update(
            status=FuelRequest.Status.COMPLETED,
            completed_at=admin.timezone.now()
        )
        self.message_user(request, f"{count} request(s) marked as completed.")

    mark_completed.short_description = "Mark selected as COMPLETED"


@admin.register(VehicleVerification)
class VehicleVerificationAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "fuel_request",
        "status",
        "verification_method",
        "verified_by_name",
        "verified_at",
        "created_at",
    )

    list_filter = (
        "status",
        "verification_method",
        "verified_at",
        "created_at",
    )

    search_fields = (
        "fuel_request__request_number",
        "fuel_request__driver__first_name",
        "ocr_number",
        "manual_number",
    )

    readonly_fields = (
        "fuel_request",
        "verified_by",
        "verified_at",
        "created_at",
        "updated_at",
        "vehicle_image_preview",
    )

    fieldsets = (
        (
            "Verification Details",
            {
                "fields": (
                    "fuel_request",
                    "vehicle_image",
                    "vehicle_image_preview",
                )
            },
        ),
        (
            "Detection Results",
            {
                "fields": (
                    "ocr_number",
                    "manual_number",
                    "verification_method",
                )
            },
        ),
        (
            "Verification Status",
            {
                "fields": (
                    "status",
                    "failure_reason",
                )
            },
        ),
        (
            "Verified By",
            {
                "fields": (
                    "verified_by",
                    "verified_at",
                )
            },
        ),
        (
            "System Information",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    def verified_by_name(self, obj):
        if obj.verified_by:
            return obj.verified_by.get_full_name()
        return "—"

    verified_by_name.short_description = "Verified By"

    def vehicle_image_preview(self, obj):
        if obj.vehicle_image:
            return f'<img src="{obj.vehicle_image.url}" width="300" height="auto" />'
        return "No image"

    vehicle_image_preview.allow_tags = True
    vehicle_image_preview.short_description = "Image Preview"