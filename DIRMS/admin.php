<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';
try { $user=currentUser(); } catch(Throwable $e) { header('Location: login.php?next=admin'); exit; }
if (!$user) { header('Location: login.php?next=admin'); exit; }
if ($user['role']!=='admin') { header('Location: my-reports.php?admin=denied'); exit; }
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#082844"><title>Admin Dashboard | DIRMS</title><link rel="stylesheet" href="assets/css/style.css"></head>
<body data-page="admin"><div class="admin-layout">
<aside class="admin-sidebar" id="sidebar"><a class="brand brand-inverse" href="index.php"><span class="brand-mark">✦</span><span class="brand-type"><strong>DIRMS</strong><small>ADMINISTRATION</small></span></a><div class="sidebar-label">MANAGEMENT</div><nav class="side-nav" aria-label="Dashboard"><button class="active" data-section="overview"><span>▦</span> Dashboard</button><button data-section="alerts"><span>♧</span> Manage Alerts</button><button data-section="reports"><span>▤</span> Incident Reports</button><button data-section="centers"><span>⌂</span> Evacuation Centers</button><button data-section="hotlines"><span>☎</span> Hotlines</button><button data-section="users"><span>♙</span> Users</button><button data-section="content"><span>▣</span> News & Tips</button><button data-section="settings"><span>⚙</span> Settings</button></nav><div class="sidebar-bottom"><a href="index.php">← Public Website</a><button id="adminLogout">⇥ Log out</button></div></aside>
<div class="admin-main"><header class="admin-topbar"><button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="Toggle sidebar">☰</button><div><span class="breadcrumb">DIRMS <span>/</span> Administration</span><h1 id="adminPageTitle">Dashboard</h1></div><div class="admin-profile"><span class="profile-badge">● Admin</span><div class="avatar"><?= strtoupper(htmlspecialchars(mb_substr($user['full_name'],0,1))) ?></div><span><?= htmlspecialchars($user['full_name']) ?></span></div></header><div id="adminToastRegion" class="toast-region" role="status" aria-live="polite"></div><main id="adminContent" class="admin-content"><div class="skeleton" style="height:220px"></div></main><footer class="admin-footer">DIRMS • Disaster Preparedness & Community Management System</footer></div>
</div>
<div class="modal-backdrop" id="editorModal" hidden><div class="modal-card editor-card" role="dialog" aria-modal="true" aria-labelledby="editorTitle"><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button><div class="editor-heading"><span class="eyebrow">CONTENT MANAGEMENT</span><h2 id="editorTitle">Edit Entry</h2></div><form id="editorForm" class="form-stack"></form></div></div>
<div class="modal-backdrop" id="adminDetailModal" hidden><div class="modal-card editor-card" role="dialog" aria-modal="true" aria-labelledby="adminDetailTitle"><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button><div id="adminDetailContent"></div></div></div>
<script src="assets/js/admin.js" defer></script>
</body></html>
