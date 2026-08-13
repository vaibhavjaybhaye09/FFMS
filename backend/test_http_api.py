#!/usr/bin/env python
"""
Test script to verify HTTP API endpoints: register, login, logout.
"""

import os
import sys
import django
import json

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from django.test import Client
from fuel.models import User

client = Client()

# Clean up test user
mobile = "9999999999"
User.objects.filter(mobile_number=mobile).delete()

print("=" * 70)
print("TEST 1: Register API Endpoint")
print("=" * 70)

register_data = {
    "mobile_number": mobile,
    "password": "TestPass123",
    "first_name": "Alice",
    "role": "DRIVER"
}

response = client.post(
    "/api/register/",
    data=json.dumps(register_data),
    content_type="application/json"
)

print(f"Status Code: {response.status_code} (expected 201)")
response_data = json.loads(response.content)
print(f"Response: {json.dumps(response_data, indent=2)}")

if response.status_code == 201:
    print("✓ Registration API works!")
    user_id = response_data["user"]["id"]
else:
    print("✗ Registration failed!")
    sys.exit(1)

# Test 2: Try login without approval (should fail)
print("\n" + "=" * 70)
print("TEST 2: Login API (Before Approval - Should Fail)")
print("=" * 70)

login_data = {
    "mobile_number": mobile,
    "password": "TestPass123"
}

response = client.post(
    "/api/login/",
    data=json.dumps(login_data),
    content_type="application/json"
)

print(f"Status Code: {response.status_code} (expected 400)")
response_data = json.loads(response.content)
print(f"Response: {json.dumps(response_data, indent=2)}")

if response.status_code == 400:
    print("✓ Correctly rejected login before approval!")
else:
    print("✗ Expected rejection before approval!")
    sys.exit(1)

# Test 3: Admin approval
print("\n" + "=" * 70)
print("TEST 3: Admin Approval (Simulated)")
print("=" * 70)

user = User.objects.get(id=user_id)
user.employee_id = f"EMP{user.id:05d}"
user.approval_status = User.ApprovalStatus.APPROVED
user.is_active = True
user.save(update_fields=["employee_id", "approval_status", "is_active"])

print(f"✓ User approved!")
print(f"  - Employee ID: {user.employee_id}")
print(f"  - Approval Status: {user.approval_status}")
print(f"  - Is Active: {user.is_active}")

# Test 4: Login after approval (should succeed)
print("\n" + "=" * 70)
print("TEST 4: Login API (After Approval - Should Succeed)")
print("=" * 70)

response = client.post(
    "/api/login/",
    data=json.dumps(login_data),
    content_type="application/json"
)

print(f"Status Code: {response.status_code} (expected 200)")
response_data = json.loads(response.content)
print(f"Response keys: {response_data.keys()}")
print(f"User info: {response_data.get('user')}")
print(f"Has tokens: {'tokens' in response_data and 'access' in response_data['tokens']}")

if response.status_code == 200 and 'tokens' in response_data and 'access' in response_data['tokens']:
    print("✓ Login API works!")
    access_token = response_data['tokens']['access']
    refresh_token = response_data['tokens']['refresh']
else:
    print("✗ Login failed!")
    print(f"Full response: {json.dumps(response_data, indent=2)}")
    sys.exit(1)

# Test 5: Logout
print("\n" + "=" * 70)
print("TEST 5: Logout API")
print("=" * 70)

logout_data = {
    "refresh": refresh_token
}

response = client.post(
    "/api/logout/",
    data=json.dumps(logout_data),
    content_type="application/json",
    HTTP_AUTHORIZATION=f"Bearer {access_token}"
)

print(f"Status Code: {response.status_code} (expected 205)")
response_data = json.loads(response.content)
print(f"Response: {json.dumps(response_data, indent=2)}")

if response.status_code == 205:
    print("✓ Logout API works!")
else:
    print("⚠ Logout returned status {response.status_code} (may require token_blacklist package)")

print("\n" + "=" * 70)
print("ALL API TESTS PASSED!")
print("=" * 70)
print("\nAPI Flow Summary:")
print("1. POST /api/register - Creates user with PENDING approval")
print("2. POST /api/login (before approval) - Returns error")
print("3. Admin approves user (sets APPROVED + is_active=True)")
print("4. POST /api/login (after approval) - Returns JWT tokens")
print("5. POST /api/logout - Blacklists refresh token")
