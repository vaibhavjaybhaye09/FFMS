#!/usr/bin/env python
import os
import django
import sys

# Setup Django
sys.path.insert(0, r'c:\Users\cg636\Desktop\New folder\pump\backend')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from fuel.models import User, Truck, Pump, FuelRequest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
import json

# Get or create test driver
driver = User.objects.filter(role='DRIVER', approval_status='APPROVED', is_active=True).first()

if not driver:
    print("❌ ERROR: No approved driver found")
    sys.exit(1)

print(f"✓ Driver found: {driver.first_name} ({driver.mobile_number})")

# Check truck
truck = Truck.objects.filter(driver=driver).first()
if truck:
    print(f"✓ Truck assigned: {truck.truck_number} ({truck.fuel_type})")
else:
    print("⚠ WARNING: No truck assigned to this driver")

# Check pumps
pumps = Pump.objects.filter(is_active=True)
print(f"✓ Active pumps: {pumps.count()}")
for pump in pumps:
    print(f"    - {pump.name} ({pump.code}) in {pump.city}")

# Test API endpoints with authentication
client = APIClient()
refresh = RefreshToken.for_user(driver)
access_token = str(refresh.access_token)

print("\n" + "="*60)
print("TESTING API ENDPOINTS")
print("="*60)

# Test 1: /api/pumps/
print("\n1. Testing GET /api/pumps/")
response = client.get(
    '/api/pumps/',
    HTTP_AUTHORIZATION=f'Bearer {access_token}',
    format='json'
)
print(f"   Status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    pump_count = len(data.get('pumps', []))
    print(f"   ✓ Pumps returned: {pump_count}")
    if pump_count > 0:
        print(f"   Sample: {data['pumps'][0]}")
else:
    print(f"   ❌ Error: {response.content}")

# Test 2: /api/my-truck/
print("\n2. Testing GET /api/my-truck/")
response = client.get(
    '/api/my-truck/',
    HTTP_AUTHORIZATION=f'Bearer {access_token}',
    format='json'
)
print(f"   Status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    if data.get('truck'):
        print(f"   ✓ Truck data returned:")
        print(f"      - Truck number: {data['truck'].get('truck_number')}")
        print(f"      - Fuel type: {data['truck'].get('fuel_type')}")
        print(f"      - Capacity: {data['truck'].get('capacity_liters')}L")
    else:
        print(f"   ⚠ No truck assigned: {data.get('message')}")
else:
    print(f"   ❌ Error: {response.content}")

# Test 3: /api/fuel-requests/mine/
print("\n3. Testing GET /api/fuel-requests/mine/")
response = client.get(
    '/api/fuel-requests/mine/',
    HTTP_AUTHORIZATION=f'Bearer {access_token}',
    format='json'
)
print(f"   Status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    request_count = len(data.get('fuel_requests', []))
    print(f"   ✓ Fuel requests returned: {request_count}")
    if request_count > 0:
        print(f"   Sample request: {data['fuel_requests'][0]}")
else:
    print(f"   ❌ Error: {response.content}")

print("\n" + "="*60)
print("✓ Testing complete!")
print("="*60)
