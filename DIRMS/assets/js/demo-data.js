// Sample UI data for preview.html and admin-preview.html only. Never use for live emergency decisions.
(function(){
 'use strict';
 const now='2026-11-05 08:00:00';
 const initial={
   alerts:[
     {id:1,title:'Demo: Flood Warning',alert_type:'Flood',severity:'high',location:'San Pablo City',description:'Example alert. This is NOT a real flood warning. Monitoring information here is for demonstration purposes only.',instructions:'Check verified PAGASA and CDRRMO announcements.',created_at:now,expires_at:null,is_demo:1,is_active:1},
     {id:2,title:'Demo: Strong Winds Advisory',alert_type:'Strong Winds',severity:'medium',location:'San Pablo City',description:'Sample advisory for demonstrating how residents can view weather-related announcements.',instructions:'Stay informed through official local advisories.',created_at:'2026-11-04 20:00:00',expires_at:null,is_demo:1,is_active:1},
     {id:3,title:'Demo: Heavy Rainfall Warning',alert_type:'Heavy Rainfall',severity:'extreme',location:'San Pablo City',description:'This is fictional data for testing alert filters and detail views.',instructions:'Verify current weather and hazards with official agencies.',created_at:'2026-11-03 11:00:00',expires_at:null,is_demo:1,is_active:1},
     {id:4,title:'Demo: Community Safety Notice',alert_type:'Other',severity:'low',location:'San Pablo City',description:'A sample low-severity announcement used to test pagination.',instructions:'Follow official emergency preparedness guidance.',created_at:'2026-11-02 10:00:00',expires_at:null,is_demo:1,is_active:1}
   ],
   centers:[
     {id:1,name:'San Jose Covered Court',barangay:'San Jose',address:'Brgy. San Jose, San Pablo City, Laguna',capacity:300,occupancy:0,latitude:null,longitude:null,notes:'Demo record: center status unverified.',is_demo:1,is_active:1},
     {id:2,name:'City Gymnasium',barangay:'San Antonio',address:'Brgy. San Antonio, San Pablo City, Laguna',capacity:500,occupancy:500,latitude:null,longitude:null,notes:'Demo record: full status is fictional.',is_demo:1,is_active:1},
     {id:3,name:'Barangay Hall',barangay:'San Miguel',address:'Brgy. San Miguel, San Pablo City, Laguna',capacity:100,occupancy:10,latitude:null,longitude:null,notes:'Demo record: availability is fictional.',is_demo:1,is_active:1},
     {id:4,name:'Community Shelter',barangay:'San Rafael',address:'Brgy. San Rafael, San Pablo City, Laguna',capacity:200,occupancy:40,latitude:null,longitude:null,notes:'Demo record for the show-all function.',is_demo:1,is_active:1}
   ],
   hotlines:[
    {id:1,organization:'National Emergency Hotline',phone:'911',description:'Ambulance, police, fire and rescue emergencies nationwide.',sort_order:1,is_active:1,is_demo:0},
    {id:2,organization:'San Pablo City CDRRMO Emergency',phone:'0998 540 7171',description:'Local disaster response and emergency coordination.',sort_order:2,is_active:1,is_demo:0},
    {id:3,organization:'Laguna Provincial Emergency Hotline',phone:'0919 417 3698',description:'Provincial emergency assistance line.',sort_order:3,is_active:1,is_demo:0},
    {id:4,organization:'Philippine Red Cross',phone:'143',description:'Ambulance coordination and emergency assistance.',sort_order:4,is_active:1,is_demo:0},
    {id:5,organization:'Philippine National Police (PNP)',phone:'117',description:'National police emergency line.',sort_order:5,is_active:1,is_demo:0},
    {id:6,organization:'Bureau of Fire Protection (BFP)',phone:'(02) 8426-0219',description:'Central office; call 911 for urgent local fires.',sort_order:6,is_active:1,is_demo:0},
    {id:7,organization:'San Pablo City CDRRM Office',phone:'(049) 800 0405',description:'Local disaster office landline.',sort_order:7,is_active:1,is_demo:0},
    {id:8,organization:'National Disaster Response (NDRRMC)',phone:'(02) 8911-5061',description:'National disaster operations; request local 100.',sort_order:8,is_active:1,is_demo:0},
    {id:9,organization:'DSWD Disaster Response Unit',phone:'(02) 8856-3665',description:'Disaster welfare and relief coordination.',sort_order:9,is_active:1,is_demo:0},
    {id:10,organization:'PAGASA Weather Information',phone:'(02) 8284-0800',description:'Weather and storm information, not dispatch.',sort_order:10,is_active:1,is_demo:0},
    {id:11,organization:'PHIVOLCS Earthquake Information',phone:'(02) 8426-1468',description:'Earthquake and volcano information trunkline.',sort_order:11,is_active:1,is_demo:0}
   ],
   tips:[
     {id:1,title:'Before a Typhoon',body:'Prepare supplies and a go bag. Charge devices, secure important documents and check official weather bulletins.',icon:'cloud',sort_order:1},
     {id:2,title:'During a Flood',body:'Avoid walking or driving through floodwater. Follow instructions from local emergency authorities.',icon:'waves',sort_order:2},
     {id:3,title:'Earthquake Safety',body:'Drop, Cover, and Hold On while the ground is shaking. Evacuate safely afterward when instructed.',icon:'activity',sort_order:3},
     {id:4,title:'Emergency Go Bag',body:'Pack drinking water, first aid supplies, medicines, flashlight, important IDs and a radio.',icon:'briefcase',sort_order:4},
     {id:5,title:'Family Emergency Plan',body:'Agree on emergency contacts, a reunion point and an evacuation route with your household.',icon:'users',sort_order:5},
     {id:6,title:'Fire Safety',body:'Know your exits. If a fire starts, leave safely, stay low under smoke, call 911 and never go back inside.',icon:'fire',sort_order:6},
     {id:7,title:'Landslide Preparedness',body:'Stay alert for cracks, leaning trees and moving rocks near slopes after heavy rainfall. Evacuate when advised.',icon:'mountain',sort_order:7},
     {id:8,title:'After a Disaster',body:'Return only after official clearance and avoid downed wires, damaged buildings and contaminated water.',icon:'shield',sort_order:8}
   ],
   news:[{id:1,title:'Demo: Community Preparedness Update',summary:'This sample news entry demonstrates how official community information can appear in the disaster news section. Replace with verified sources.',source_url:'',is_active:1,is_demo:1,created_at:'2026-11-04 10:00:00'}],
   settings:{site_name:'DIRMS',city:'San Pablo City, Laguna',contact_email:'',safety_banner:'DEMO ONLY — Alerts and evacuation center availability are sample data, NOT live or verified. Confirm with official local authorities.'}
 };
 const admin={...initial,
  users:[{id:1,full_name:'Demo Administrator',email:'admin@example.com',phone:'',role:'admin',is_active:1,created_at:now},{id:2,full_name:'Demo Resident',email:'resident@example.com',phone:'',role:'resident',is_active:1,created_at:now}],
  reports:[{id:101,incident_type:'Flood',location:'Brgy. San Jose',description:'This is a sample incident report for testing the review interface.',reporter_name:'Demo Resident',reporter_contact:'',status:'pending',admin_notes:'',photo_path:null,is_demo:1,created_at:now},{id:102,incident_type:'Landslide',location:'Brgy. San Miguel',description:'Fictional incident record.',reporter_name:'Demo Resident',reporter_contact:'',status:'reviewing',admin_notes:'',photo_path:null,is_demo:1,created_at:'2026-11-04 12:00:00'}],
  activity:[]
 };
 try {const saved=localStorage.getItem('bs_preview_admin_v3');window.BS_PREVIEW_ADMIN=saved?JSON.parse(saved):admin;} catch {window.BS_PREVIEW_ADMIN=admin;}
 const d=window.BS_PREVIEW_ADMIN;
 window.BS_PREVIEW_DATA={alerts:d.alerts.filter(a=>Number(a.is_active)),centers:d.centers.filter(c=>Number(c.is_active)),hotlines:d.hotlines.filter(h=>Number(h.is_active)),tips:d.tips,news:d.news.filter(n=>Number(n.is_active)),settings:d.settings};
 window.BS_SAVE_PREVIEW=()=>{try{localStorage.setItem('bs_preview_admin_v3',JSON.stringify(window.BS_PREVIEW_ADMIN));}catch{}};
})();
