from django.db import models
from django.conf import settings
# Create your models here.
from django.contrib.auth.models import AbstractBaseUser

class User(AbstractBaseUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        OPERATOR = "OPERATOR", "PUMPOPERATOR"
        DRIVER = "DRIVER","Truck Driver"

    employee_id = models.CharField(max_length=20, unique=True, null=True, blank=True)
    mobile_number = models.CharField(max_length=15, unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.DRIVER)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at =models.DateTimeField(auto_now = True)
    USERNAME_FIELD ="mobile_number"
    REQUIRED_FIELDS =["username", "first_name"]

    def __str__(self):
        return f"{self}"

class Pump(models.model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, unique=True)
    address = models.TextField(max_length=100)
    city = models.CharField(max_length=100)
    contact_number = models.CharField(max_length=15, blank= True)
    operator = models.ManyToManyField(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null= True, blank =True, limit_choices_to={"role":"OPERATOR"}, related_name="assigned_pumps")
    is_active = models.BooleanField(default =True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    def __str__(self):
        return f"{self.code} - {self.name}"
    


class Truck(models.Model):
    class FuelType(models.TextChoices):
        DIESEL = "DIESEL", "Diesel"
        PETROL = "PETROL", "Petrol"

    truck_number = models.CharField(max_length=20,unique=True)
    driver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,blank=True, related_name="trucks")
    fuel_type =models.CharField(max_length=10, choices=FuelType.choices, default=FuelType.DIESEL)
    capacity_liters = models.PositiveBigIntegerField(null=True, blank=True, help_text="Maximum Fuel Tank Capacity")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __set__(self, instance, value):
        return self.truck_number


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

    request_number = models.CharField(max_length=20, unique=True)
    truck = models.ForeignKey("Truck", on_delete=PROTECT,related_name="fuel_request")
    


    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
        