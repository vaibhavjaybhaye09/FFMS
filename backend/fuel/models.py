from django.db import models
from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager


# ============================================================
# USER MANAGER
# ============================================================

class UserManager(BaseUserManager):

    def create_user(self, username=None, mobile_number=None, password=None, **extra_fields):

        if not username and not mobile_number:
            raise ValueError("Username or mobile number is required")

        if not username:
            username = mobile_number

        if not mobile_number:
            mobile_number = username

        user = self.model(
            username=username,
            mobile_number=mobile_number,
            **extra_fields
        )

        user.set_password(password)
        user.save(using=self._db)

        return user

    def create_superuser(self, username="admin", mobile_number="1234567890", password=None, **extra_fields):

        extra_fields.setdefault("role", User.Role.ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("approval_status", User.ApprovalStatus.APPROVED)

        return self.create_user(
            username=username,
            mobile_number=mobile_number,
            password=password,
            **extra_fields
        )


# ============================================================
# USER
# ============================================================

class User(AbstractBaseUser):

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Super Admin"
        PUMP_ADMIN = "PUMP_ADMIN", "Pump Admin"
        TRUCK_OWNER = "TRUCK_OWNER", "Truck Owner"
        REGULAR_CUSTOMER = "REGULAR_CUSTOMER", "Regular Customer"
        OPERATOR = "OPERATOR", "Pump Operator"
        DRIVER = "DRIVER", "Truck Driver"

    class ApprovalStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    username = models.CharField(
        max_length=50,
        unique=True,
        null=True,
        blank=True
    )

    employee_id = models.CharField(
        max_length=20,
        unique=True,
        null=True,
        blank=True
    )

    mobile_number = models.CharField(
        max_length=15,
        unique=True,
        null=True,
        blank=True
    )

    must_change_password = models.BooleanField(
        default=False,
        help_text="Requires password change on first login"
    )

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.DRIVER
    )

    approval_status = models.CharField(
        max_length=20,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING
    )

    pump = models.ForeignKey(
        "Pump",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="associated_users"
    )

    created_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_users"
    )

    is_active = models.BooleanField(
        default=False
    )

    is_staff = models.BooleanField(
        default=False
    )

    is_superuser = models.BooleanField(
        default=False
    )

    first_name = models.CharField(
        max_length=100
    )

    last_name = models.CharField(
        max_length=100,
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    objects = UserManager()

    USERNAME_FIELD = "mobile_number"

    REQUIRED_FIELDS = []

    def __str__(self):
        return f"{self.first_name} - {self.mobile_number}"

    def has_perm(self, perm, obj=None):
        return self.is_superuser

    def has_module_perms(self, app_label):
        return self.is_superuser

    def get_full_name(self):
        """Return the user's full name (first + last)."""
        return f"{self.first_name} {self.last_name}".strip()


# ============================================================
# PUMP
# ============================================================

class Pump(models.Model):

    name = models.CharField(
        max_length=100
    )

    code = models.CharField(
        max_length=20,
        unique=True
    )

    address = models.TextField()

    city = models.CharField(
        max_length=100
    )

    contact_number = models.CharField(
        max_length=15,
        blank=True
    )

    pump_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_pumps",
        limit_choices_to={"role__in": ["ADMIN", "PUMP_ADMIN"]},
        help_text="Main admin for this pump"
    )

    operators = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="PumpOperator",
        related_name="assigned_pumps",
        blank=True,
    )

    is_active = models.BooleanField(
        default=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return f"{self.code} - {self.name}"


class PumpOperator(models.Model):

    pump = models.ForeignKey(
        Pump,
        on_delete=models.CASCADE,
        related_name="pump_operators"
    )

    operator = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pump_assignment",
        limit_choices_to={
            "role": User.Role.OPERATOR
        }
    )

    assigned_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["operator"],
                name="unique_operator_one_pump"
            )
        ]

    def __str__(self):
        return f"{self.pump.code} - {self.operator}"
    
class Truck(models.Model):

    class FuelType(models.TextChoices):
        DIESEL = "DIESEL", "Diesel"
        PETROL = "PETROL", "Petrol"

    truck_number = models.CharField(
        max_length=20,
        unique=True
    )

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        limit_choices_to={"role__in": ["REGULAR_CUSTOMER", "TRUCK_OWNER"]},
        related_name="trucks_owned",
        help_text="Truck owner / customer who owns this truck"
    )

    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={"role": User.Role.DRIVER},
        related_name="trucks"
    )

    fuel_type = models.CharField(
        max_length=10,
        choices=FuelType.choices,
        default=FuelType.DIESEL
    )

    capacity_liters = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum fuel tank capacity"
    )

    is_active = models.BooleanField(
        default=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return self.truck_number


# ============================================================
# FUEL REQUEST
# ============================================================

class FuelRequest(models.Model):

    class FuelType(models.TextChoices):
        DIESEL = "DIESEL", "Diesel"
        PETROL = "PETROL", "Petrol"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        VERIFIED = "VERIFIED", "Verified"
        COMPLETED = "COMPLETED", "Completed"

    request_number = models.CharField(
        max_length=20,
        unique=True
    )

    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        limit_choices_to={"role": User.Role.DRIVER},
        related_name="fuel_requests"
    )

    truck = models.ForeignKey(
        "Truck",
        on_delete=models.PROTECT,
        related_name="fuel_requests"
    )

    pump = models.ForeignKey(
        "Pump",
        on_delete=models.PROTECT,
        related_name="fuel_requests"
    )

    fuel_type = models.CharField(
        max_length=10,
        choices=FuelType.choices
    )

    requested_liters = models.DecimalField(
        max_digits=6,
        decimal_places=2
    )

    approved_liters = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True
    )

    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={"role": User.Role.OPERATOR},
        related_name="handled_fuel_requests"
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )

    remarks = models.TextField(
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    approved_at = models.DateTimeField(
        null=True,
        blank=True
    )

    completed_at = models.DateTimeField(
        null=True,
        blank=True
    )

    def __str__(self):
        return self.request_number


# ============================================================
# VEHICLE VERIFICATION
# ============================================================

class VehicleVerification(models.Model):

    class VerificationMethod(models.TextChoices):
        OCR = "OCR", "OCR"
        MANUAL = "MANUAL", "Manual"

    class VerificationStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        VERIFIED = "VERIFIED", "Verified"
        FAILED = "FAILED", "Failed"

    fuel_request = models.OneToOneField(
        "FuelRequest",
        on_delete=models.CASCADE,
        related_name="vehicle_verification"
    )

    vehicle_image = models.ImageField(
        upload_to="vehicle_verification/",
        null=True,
        blank=True
    )

    ocr_number = models.CharField(
        max_length=20,
        null=True,
        blank=True
    )

    manual_number = models.CharField(
        max_length=20,
        null=True,
        blank=True
    )

    verification_method = models.CharField(
        max_length=10,
        choices=VerificationMethod.choices,
        null=True,
        blank=True
    )

    status = models.CharField(
        max_length=10,
        choices=VerificationStatus.choices,
        default=VerificationStatus.PENDING
    )

    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={"role": User.Role.OPERATOR},
        related_name="vehicle_verifications"
    )

    verified_at = models.DateTimeField(
        null=True,
        blank=True
    )

    failure_reason = models.CharField(
        max_length=255,
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return f"{self.fuel_request.request_number} - {self.status}"