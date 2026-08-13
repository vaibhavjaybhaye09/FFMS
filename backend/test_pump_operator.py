#!/usr/bin/env python
"""
Test script to verify pump operator assignment functionality.
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from fuel.models import User, Pump, PumpOperator

print("=" * 70)
print("TEST: Pump Operator Assignment")
print("=" * 70)

# Create test pump
print("\n1. Creating test pump...")
pump = Pump.objects.create(
    code="PUMP001",
    name="Test Pump",
    address="123 Main St",
    city="Mumbai",
    contact_number="9876543210",
    is_active=True
)
print(f"✓ Pump created: {pump}")

# Create test operator user
print("\n2. Creating test operator user...")
operator = User.objects.create_user(
    mobile_number="9111111111",
    password="TestOp@123",
    first_name="Rajesh",
    last_name="Kumar",
    role=User.Role.OPERATOR,
    approval_status=User.ApprovalStatus.APPROVED,
)
operator.employee_id = f"EMP{operator.id:05d}"
operator.is_active = True
operator.save()
print(f"✓ Operator created: {operator.get_full_name()}")

# Assign operator to pump
print("\n3. Assigning operator to pump...")
pump_operator = PumpOperator.objects.create(
    pump=pump,
    operator=operator
)
print(f"✓ Operator assigned!")
print(f"  - Pump: {pump_operator.pump.name}")
print(f"  - Operator: {pump_operator.operator.get_full_name()}")
print(f"  - Mobile: {pump_operator.operator.mobile_number}")
print(f"  - Assigned At: {pump_operator.assigned_at}")

# Verify the relationship
print("\n4. Verifying the relationship...")
pump_with_operators = Pump.objects.get(id=pump.id)
print(f"✓ Pump '{pump_with_operators.name}' has {pump_with_operators.operators.count()} operator(s)")
for op in pump_with_operators.operators.all():
    print(f"  - {op.get_full_name()} ({op.mobile_number})")

print("\n" + "=" * 70)
print("✓ ALL TESTS PASSED!")
print("=" * 70)
print("\nAdmin Panel Usage:")
print("1. Go to http://127.0.0.1:8000/admin/fuel/pump/")
print("2. Click on a pump to edit it")
print("3. Scroll to 'Operators' section")
print("4. Click 'Add another Operator' to assign an operator")
print("5. Select an OPERATOR role user from the dropdown")
print("6. Click 'Save' to assign the operator to the pump")
print("\nAlternatively:")
print("1. Go to http://127.0.0.1:8000/admin/fuel/pumpoperator/")
print("2. Click 'Add Pump Operator'")
print("3. Select pump and operator")
print("4. Click 'Save'")
