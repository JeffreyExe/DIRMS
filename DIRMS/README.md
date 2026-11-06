# DIRMS — Multipage Disaster Management System (v4)

Built as a PHP 8.2+ / MySQL application for XAMPP. **This is an educational demo**, not a dispatch service or official source of live disaster warnings. Seeded alerts, news and evacuation centers are deliberately labeled as demo records. Verify all physical shelter locations, phone numbers and safety notices before real-world use.

## What changed in this version

- The **Home page** (`index.php`) matches the requested composition: family illustration / Stay Informed. Stay Safe.; latest disaster alert; illustrated family preparedness feature. No long one-page dashboard sections.
- Every major feature now has its **own URL**, separate from Home.
- The top navigation and all Home buttons navigate to those real pages instead of using `#section` anchors.
- New resident **My Reports** page lets signed-in users inspect their report statuses and administrator notes.
- Dedicated **Login** and **Register** webpages. Admin sign-in redirects to `admin.php`; residents go to My Reports.
- Clear admin login instructions and a dashboard link on the Login page. Only authorized admin accounts can access `admin.php` or admin API actions.
- Improved alert paging, error messages for database outages, form validation, and map preview behavior preserved across pages.
- Responsive desktop/mobile layouts with an accessible mobile navigation toggle.

## Live PHP webpages

| URL | What it does |
| --- | --- |
| `index.php` | Homepage with hero, latest alert, safety feature. |
| `alerts.php` | Search, filter, refresh and read published alerts. Only active/unexpired alerts from MySQL. |
| `report-incident.php` | Submit incident type, location, description, contact, optional photo; obtain a unique receipt number. |
| `evacuation-centers.php` | Search centers; map previews and Google Maps links with GPS coordinate precision when set. |
| `hotlines.php` | Emergency directory with tap-to-call numbers. |
| `tips.php` | Illustrated and expandable family safety steps. |
| `news.php` | Admin-published community news and external source links. |
| `login.php` | Login to a resident or administrator account. |
| `register.php` | Create a resident account (not an administrator). |
| `my-reports.php` | See your incident reports submitted while logged in, including status and review notes. |
| `admin.php` | Administrator-only dashboard: alerts, reports, centers, users, hotlines, news, tips, settings. |
| `setup.php` | One-time admin account + database installer (localhost only). |
| `update-directory.php` | Admin-only, non-destructive addition of missing hotlines and safety tips for existing installs. |

### How to get to the ADMIN DASHBOARD

**For first-time installation:**

1. Start **Apache** and **MySQL** in XAMPP.
2. Open `http://localhost/DIRMS/setup.php` in the browser on your PC.
3. Enter your name, email, and a password of at least 12 characters, then click **Create Admin & Install**.
4. Open `http://localhost/DIRMS/login.php`, and log in with that **same administrator email and password**.
5. You will be redirected to `http://localhost/DIRMS/admin.php` automatically. The public navbar also shows **Admin Dashboard** while you're logged in as an administrator.
6. To return to admin later, you can directly open `http://localhost/DIRMS/admin.php` after logging in.

**For an existing installation:** do **not** run setup to recreate an account. Use the administrator email and password you created earlier. Resident accounts created on `register.php` cannot open the admin dashboard. Only an existing administrator can promote someone through **Admin → Users**.

There is **no default or hardcoded admin password**. If you never created one, use `setup.php`. If an admin already exists, reset account access using a secure, administrator-controlled database recovery process; do not expose setup publicly.

## Installation (Windows XAMPP)

1. Extract the ZIP. Copy the enclosed folder **`DIRMS`** into `C:\xampp\htdocs\` (or `C:\xampp83\htdocs\` if that's your XAMPP directory).
2. Start **Apache** and **MySQL** in XAMPP.
3. If your MySQL credentials differ, edit `DIRMS/config.php` (the defaults are local MySQL `root`, empty password, database `bantay_sakuna`).
4. First time only: open `http://localhost/DIRMS/setup.php` and create your admin account.
5. Visit `http://localhost/DIRMS/index.php` to open Home.
6. Open the other pages via the top navigation.

**Updating a previously installed v3:**

1. Export a backup of your **`bantay_sakuna` MySQL database** in phpMyAdmin. Back up the entire old `C:\xampp\htdocs\DIRMS` folder.
2. Copy the new code over your old `DIRMS` project, **preserving your customized `config.php` and `uploads/` directory**, and any locally customized files you want to keep.
3. **Do not delete, drop or import over your existing database.** The v4 public-page update retains the same schema.
4. Log in on `login.php` using your existing admin email and password.
5. If you did not already add the expanded emergency directory, open `http://localhost/DIRMS/update-directory.php` while logged in as admin and click **Add Missing Hotlines and Tips**. It leaves existing accounts and incident reports intact.
6. Confirm the admin alert/center/hotline/news/tips entries and real GPS coordinates in the dashboard.

**Security after installation:** restrict or delete `setup.php` and `update-directory.php` when you no longer need them; serve the site over HTTPS outside localhost; change sample data; verify admin account access; use proper server-side backups; confirm correct permissions on `uploads`.

## Functional workflows

### Alerts

Admin publishes an alert in **Admin → Manage Alerts**. Only active alerts whose expiry has not passed appear on `alerts.php` and the latest-alert Home card. Visitors can filter by **All, Extreme, High, Medium or Low**, search by title/location/description, refresh, change pages, or open full details including safety instructions. No external real-time feed is integrated; content is entered by admins.

### Report an incident

Any visitor can submit a report; the application accepts optional JPG, PNG or WebP images up to 5 MB. Required fields are incident type, location and a description of at least 10 characters. The report is written to MySQL as **pending**, and a receipt like `BS-000123` is shown. Reports are rate-limited to one per 15 seconds per session. If you were **already logged in when you submitted**, that report appears in **My Reports**. Guest reports are not automatically linked to an account created later.

The admin can open **Admin → Incident Reports** to see the details or the photo, change status (pending/reviewing/resolved/rejected), and leave a note. Note that a report is **not** an automatically dispatched rescue request. Call **911** for immediate danger.

### Evacuation centers

In **Admin → Evacuation Centers**, add/edit the name, full address, barangay, capacity, occupancy and, ideally, **both GPS latitude and GPS longitude**. Public map thumbnails open a larger map; each **View Map** button opens Google Maps at requested zoom level 18. With GPS, the URL targets the exact submitted coordinates; without GPS, it uses an **approximate address search**, clearly labeled as such. Accurate pins require verified coordinates and Internet access to Google Maps. Demo centers are **not confirmed operating shelters**.

### Emergency Hotlines, Safety Tips, News

Admin can add/edit/delete contact numbers, safety tips and bulletins. The public webpages render the active entries from MySQL. Tap-to-call uses `tel:` and works on compatible phones. Source URLs open in a new tab with safe `rel` attributes. Check official contact details and safety guidance regularly.

### Users

Residents register and log in through separate pages. Passwords are hashed, sessions are server-side, and administrator privileges are checked by the server. Only administrator accounts may access `admin.php` and admin endpoints. Admins can enable/disable users and grant/revoke administrator role (but cannot remove their own admin access).

## Preview without MySQL

The ZIP also includes `preview.html`, `preview-alerts.html`, `preview-report-incident.html`, `preview-evacuation-centers.html`, etc. These are **interactive browser previews only**. Their simulated incident reports and admin changes use your browser storage and **do not write to a server**, send alerts or notify responders. Open `preview.html` for a look at the design or `admin-preview.html` for the demonstration dashboard. Use the `.php` pages through XAMPP for live database functionality.

## Testing status and checklist

- **Passed:** PHP syntax checks for all PHP files; JavaScript syntax checks.
- **Passed in browser simulation:** Home composition, links to separate pages, alert search/severity filter/detail/refresh, report form validation and receipt, evacuation center display and Google Maps URL construction, hotlines, safety accordion, news page, login/register forms, logged-out My Reports state, mobile menu and no 390px horizontal overflow.
- **Implemented and code-reviewed:** administrator-only PHP permission check, admin management CRUD endpoints, CSRF, session-based authentication and user report query.
- **Still requires XAMPP verification:** end-to-end MySQL create/read/update/delete, session redirect after actual admin login, real uploads, persistent reports across users, direct phone-call handling, and external Google Maps rendering. This environment does not have a running MySQL instance.

Manual checks on your XAMPP PC:

1. Register a resident; log out and log in again.
2. While logged in, submit a non-emergency **test** report; verify its receipt in My Reports.
3. Log in as admin; review the test report, update its status and add a note; switch back to the resident and confirm the change.
4. Create a DEMO alert, publish and unpublish it; ensure public Alerts reflects visibility correctly.
5. Create a test evacuation center with GPS coordinates; click the image/map and Google Maps button; verify the actual pin and zoom.
6. Add/edit/remove a hotline, tip and news card; confirm updates on their public pages.
7. Check that a resident or logged-out user cannot access `admin.php` or `api.php?action=admin_data`.
8. Submit invalid/oversized photo types to verify rejection. Confirm mobile menu works and backups are configured.

## Files

- `index.php` — multipage template with the Home layout and shared header/footer
- Other `*.php` route wrappers — standalone public URLs
- `api.php` — authentication, incident reporting, public data, and administrator API
- `admin.php` and `assets/js/admin.js` — protected dashboard
- `assets/js/app.js` — shared public page behaviors
- `assets/css/style.css` — responsive visual design
- `schema.sql`, `setup.php`, `config.php` — database setup
- `app/bootstrap.php` — PDO sessions / CSRF / validation helpers
- `app/community-seed.php` — sample contact and tip entries
- `uploads/` — incident photos (PHP execution disabled with .htaccess)
- `preview*.html` and `admin-preview.html` — demo-only browser previews
