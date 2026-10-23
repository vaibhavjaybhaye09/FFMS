from django import forms
from django.contrib import admin
from .models import User, Pump, Truck, FuelRequest, VehicleVerification, PumpOperator


class PumpAdminForm(forms.ModelForm):
    operators_field = forms.ModelMultipleChoiceField(
        queryset=User.objects.filter(role=User.Role.OPERATOR),
        widget=forms.CheckboxSelectMultiple,
        required=False,
        label="Operators"
    )

    class Meta:
        model = Pump
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.fields["operators_field"].initial = self.instance.operators.all()

    def save(self, commit=True):
        pump = super().save(commit=False)
        if commit:
            pump.save()
        if pump.pk:
            selected_operators = self.cleaned_data.get("operators_field", [])
            # Update PumpOperators
            existing_operator_ids = set(pump.operators.values_list("id", flat=True))
            selected_operator_ids = set(op.id for op in selected_operators)

            to_add = selected_operator_ids - existing_operator_ids
            to_remove = existing_operator_ids - selected_operator_ids

            if to_remove:
                PumpOperator.objects.filter(pump=pump, operator_id__in=to_remove).delete()
            
            for op_id in to_add:
                PumpOperator.objects.create(pump=pump, operator_id=op_id)
                
        return pump

class UserAdminForm(forms.ModelForm):
    set_new_password = forms.CharField(
        widget=forms.PasswordInput,
        required=False,
        label="Set Password",
        help_text="Must be exactly 9 characters long for Pump Admin accounts."
    )

    class Meta:
        model = User
        fields = "__all__"

    def clean(self):
        cleaned_data = super().clean()
        role = cleaned_data.get("role")
        username = cleaned_data.get("username")
        password = cleaned_data.get("set_new_password")

        if role == User.Role.PUMP_ADMIN:
            if not username or len(username.strip()) != 9:
                self.add_error("username", "Pump Admin username must be exactly 9 characters long.")
            if not self.instance.pk and (not password or len(password.strip()) != 9):
                self.add_error("set_new_password", "Pump Admin password must be exactly 9 characters long.")
            elif password and len(password.strip()) != 9:
                self.add_error("set_new_password", "Pump Admin password must be exactly 9 characters long.")

        return cleaned_data

    def save(self, commit=True):
        user = super().save(commit=False)
        new_pwd = self.cleaned_data.get("set_new_password")
        if new_pwd:
            user.set_password(new_pwd.strip())
        if user.role == User.Role.PUMP_ADMIN:
            user.is_staff = True
            user.approval_status = User.ApprovalStatus.APPROVED
            user.is_active = True
        if commit:
            user.save()
        return user


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    form = UserAdminForm

    list_display = (
        "id",
        "username",
        "employee_id",
        "first_name",
        "mobile_number",
        "role",
        "pump",
        "created_by",
        "approval_status",
        "is_active",
        "must_change_password",
        "created_at",
    )

    list_filter = (
        "role",
        "approval_status",
        "is_active",
        "must_change_password",
        "created_at",
    )

    search_fields = (
        "username",
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
        "activate_users",
        "deactivate_users",
    ]

    fieldsets = (
        (
            "User Information",
            {
                "fields": (
                    "username",
                    "first_name",
                    "last_name",
                    "mobile_number",
                    "set_new_password",
                    "role",
                    "pump",
                    "created_by",
                    "must_change_password",
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


@admin.register(Pump)
class PumpAdmin(admin.ModelAdmin):
    form = PumpAdminForm

    list_display = (
        "id",
        "code",
        "name",
        "city",
        "pump_admin",
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
        "pump_admin__first_name",
        "pump_admin__mobile_number",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )

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
                    "pump_admin",
                )
            },
        ),
        (
            "Operators",
            {
                "fields": (
                    "operators_field",
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
        "customer_name",
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
        "customer__first_name",
        "customer__last_name",
        "customer__mobile_number",
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
                    "customer",
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

    def customer_name(self, obj):
        if obj.customer:
            return obj.customer.get_full_name() or obj.customer.username
        return "—"

    customer_name.short_description = "Truck Owner"


@admin.register(FuelRequest)
class FuelRequestAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "request_number",
        "truck",
        "customer_name",
        "created_by",
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
        "truck__truck_number",
        "truck__customer__first_name",
        "truck__customer__mobile_number",
        "created_by__first_name",
        "created_by__mobile_number",
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
                    "created_by",
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

    def customer_name(self, obj):
        if obj.truck and obj.truck.customer:
            return obj.truck.customer.get_full_name() or obj.truck.customer.username
        return "-"

    customer_name.short_description = "Truck Owner"

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