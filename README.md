# FFMS - Fuel Fleet Management System

## Pump Admin Web Portal (Django Templates)
- **Web Portal URL**: [http://127.0.0.1:8000/portal/](http://127.0.0.1:8000/portal/)
- **Login Credentials**:
  - **Username**: `vaibhavja` (or mobile: `9356889170`)
  - **Password**: `@Vaibhav#123`
  - *(or Superadmin: `admin`)*
- **Portal Features**:
  - 📊 **Station Overview Dashboard**: Station KPIs, volume summary (Diesel vs Petrol), request counts.
  - 👨‍💼 **Operator Analytical Reports**: Total volume dispensed per operator, plain passwords for admin reference, fulfillment rate, average liters per fueling, and individual transaction drill-downs with live dispenser meter & vehicle plate photos.
  - 🚚 **Truck Owner & Fleet Reports**: Fleet vehicle breakdown, authentic IND license plate views, per-truck fuel consumption, and full audit logs.
  - 📜 **Audit Log & CSV Export**: Complete filterable transaction trail with photo zoom lightbox and one-click CSV export.
  - 🖼️ **Station Logo & Branding Management**:
    - **Web Portal**: Navigate to `/portal/settings/` or click "Update Logo & Info" on the dashboard. Drag & drop or pick image (PNG, JPG, WEBP, SVG) with live instant browser preview, save, or remove logo.
    - **Mobile App**: On the Pump Admin dashboard, tap the camera icon badge on the header station logo or go to the "Station Info" tab to upload, update, or remove the logo directly via device image library.
    - **Branding Display**: Logo appears dynamically in the web portal top navigation bar, station overview card, printable slips, and the mobile app header.

## In-App ID Management (React Native Mobile App)
- ⛽ **Pump Admin Dashboard (`app/pump-admin.tsx`)**:
  - **Operator Status Badge**: Real-time indicator (`ACTIVE` in green vs `DEACTIVATED` in red).
  - **Activate / Deactivate Operator ID**: Toggles operator active state with confirmation prompt. Deactivated operators cannot log in or approve fuel requests.
  - **Delete Operator ID**: Permanently deletes the operator ID, clears pump assignments, and updates historical references safely.
  - **Credential Inspector**: View mobile login ID and toggle password visibility.

- 🚚 **Truck Owner Dashboard (`app/customer.tsx`)**:
  - **Driver Status Badge**: Real-time indicator (`ACTIVE` in green vs `DEACTIVATED` in red).
  - **Activate / Deactivate Driver ID**: Toggles driver active state with confirmation prompt. When deactivated, automatically unassigns the driver from any assigned truck and prevents fuel requests.
  - **Delete Driver ID**: Permanently deletes driver credentials and unassigns any linked truck.
  - **Credential Inspector**: View mobile login ID and toggle password visibility.
  - **Truck Assignment Protection**: Trucks can only be assigned to active drivers.

---

### Test Mobile & Account Credentials
- **Pump Admin**: `vaibhavja` / `9356889170` (Password: `@Vaibhav#123`)
- **Operator**: `1234554321` (Password: `321PM567`)
- **Truck Owner**: `manteasol` / `0987654321` or `testOwner` / `Owner6789`
- **Driver**: `8390018767` (Password: `@Vaibhav#123`)