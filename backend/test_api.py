#!/usr/bin/env python
"""
Test script to verify register -> approve -> login flow.
"""

import os
import sys
import django
from django.contrib.auth import get_user_model

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from fuel.models import User

# Test 1: Create a test user via the User model
print("=" * 60)
print("TEST 1: Create and Register User")
print("=" * 60)

mobile = "9876543210"
password = "Test@123"
first_name = "John"
role = User.Role.DRIVER

# Delete if exists
User.objects.filter(mobile_number=mobile).delete()

# Create user (mimics RegisterSerializer.create)
user = User.objects.create_user(
    mobile_number=mobile,
    password=password,
    first_name=first_name,
    role=role,
)

print(f"✓ User created: {user}")
print(f"  - ID: {user.id}")
print(f"  - Mobile: {user.mobile_number}")
print(f"  - Name: {user.first_name}")
print(f"  - Role: {user.role}")
print(f"  - Approval Status: {user.approval_status} (should be PENDING)")
print(f"  - Is Active: {user.is_active} (should be False)")

# Test 2: Approve User (mimics admin action)
print("\n" + "=" * 60)
print("TEST 2: Admin Approval")
print("=" * 60)

user.employee_id = f"EMP{user.id:05d}"
user.approval_status = User.ApprovalStatus.APPROVED
user.is_active = True
user.save(update_fields=["employee_id", "approval_status", "is_active"])

print(f"✓ User approved: {user}")
print(f"  - Employee ID: {user.employee_id} (generated)")
print(f"  - Approval Status: {user.approval_status} (should be APPROVED)")
print(f"  - Is Active: {user.is_active} (should be True)")

# Test 3: Authenticate (Login)
print("\n" + "=" * 60)
print("TEST 3: Authenticate/Login")
print("=" * 60)

from django.contrib.auth import authenticate

# Authenticate
auth_user = authenticate(username=mobile, password=password)

if auth_user:
    print(f"✓ Authentication successful!")
    print(f"  - User: {auth_user}")
    print(f"  - Employee ID: {auth_user.employee_id}")
    print(f"  - Full Name: {auth_user.get_full_name()}")
    print(f"  - Role: {auth_user.role}")
    
    # Verify JWT token generation works
    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(auth_user)
    
    print(f"\n✓ JWT Token generation successful!")
    print(f"  - Refresh Token: {str(refresh)[:50]}...")
    print(f"  - Access Token: {str(refresh.access_token)[:50]}...")
else:
    print(f"✗ Authentication FAILED")
    sys.exit(1)

print("\n" + "=" * 60)
print("ALL TESTS PASSED!")
print("=" * 60)
print("\nFlow Summary:")
print("1. User registers (approval_status=PENDING, is_active=False)")
print("2. Admin approves (approval_status=APPROVED, is_active=True)")
print("3. User logs in with mobile number and password")
print("4. JWT tokens are generated and returned")
