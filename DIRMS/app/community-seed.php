<?php
declare(strict_types=1);
/**
 * Additive community starter content. Does NOT modify existing incidents, alerts,
 * evacuation locations, account credentials, or custom admin entries.
 * Existing starter phone numbers are retained without claiming recent verification.
 * They may change; administrators must re-verify before real-world deployment.
 */
function seedCommunityDirectory(PDO $database): array {
    $hotlines = [
        ['National Emergency Hotline', '911', 'Ambulance, police, fire and rescue emergencies nationwide.', 1],
        ['San Pablo City CDRRMO Emergency', '0998 540 7171', 'Local disaster response and emergency coordination (San Pablo City).', 2],
        ['Laguna Provincial Emergency Hotline', '0919 417 3698', 'Provincial government emergency assistance line.', 3],
        ['Philippine Red Cross', '143', 'Emergency assistance, ambulance coordination and Red Cross services.', 4],
        ['Philippine National Police (PNP)', '117', 'National police emergency hotline; call 911 for immediate multi-agency dispatch.', 5],
        ['Bureau of Fire Protection (BFP)', '(02) 8426-0219', 'BFP central office contact. For urgent local fires, call 911.', 6],
        ['San Pablo City CDRRM Office', '(049) 800 0405', 'San Pablo City disaster risk reduction office landline.', 7],
        ['National Disaster Response (NDRRMC)', '(02) 8911-5061', 'National disaster management operations; request local 100.', 8],
        ['DSWD Disaster Response Unit', '(02) 8856-3665', 'National disaster welfare and relief coordination.', 9],
        ['PAGASA Weather Information', '(02) 8284-0800', 'Weather, rainfall and storm information; information line, not dispatch.', 10],
        ['PHIVOLCS Earthquake Information', '(02) 8426-1468', 'Volcano and earthquake information; agency main trunkline.', 11],
    ];
    $tips = [
        ['Before a Typhoon','Follow official PAGASA warnings. Make your house safer by securing light objects, protecting important papers, preparing water and food, and planning early evacuation.','cloud',1],
        ['During a Flood','Go to higher ground and avoid contact with floodwater. Never try to cross flooded roads. Leave immediately when emergency officers issue an evacuation order.','waves',2],
        ['Earthquake Safety','DROP, COVER and HOLD ON during shaking. Stay clear of glass and falling items. When shaking ends, carefully move to a safe open area and check for hazards.','activity',3],
        ['Emergency Go Bag','Prepare a waterproof bag with water, ready-to-eat food, flashlight, radio, medicines, first-aid supplies, important IDs, power bank, cash and needed family supplies.','briefcase',4],
        ['Family Emergency Plan','Agree on contact numbers, meeting places and safe evacuation routes. Practice as a family and identify what children, elderly relatives and persons with disabilities need.','users',5],
        ['Fire Safety','Check exits and smoke hazards. Leave the building if a fire starts; stay low under smoke, use stairs and never go back inside. Call 911 from a safe place.','fire',6],
        ['Landslide Preparedness','After prolonged rain, stay alert for cracks, leaning posts, unusual noises or falling debris near slopes. Evacuate promptly if advised and avoid unstable areas.','mountain',7],
        ['After a Disaster','Return only when authorities say it is safe. Keep away from damaged structures and wires, check drinking water safety and report dangerous conditions to responders.','shield',8],
    ];
    $check=$database->prepare('SELECT id FROM hotlines WHERE organization=? AND phone=? LIMIT 1');
    $insert=$database->prepare('INSERT INTO hotlines (organization,phone,description,sort_order,is_demo,is_active) VALUES(?,?,?,?,0,1)');
    $newHotlines=0;
    foreach($hotlines as $entry) {
        $check->execute([$entry[0],$entry[1]]);
        if (!$check->fetchColumn()) { $insert->execute($entry); $newHotlines++; }
    }
    $check=$database->prepare('SELECT id FROM tips WHERE title=? LIMIT 1');
    $insert=$database->prepare('INSERT INTO tips (title,body,icon,sort_order) VALUES (?,?,?,?)');
    $newTips=0;
    foreach($tips as $entry) {
        $check->execute([$entry[0]]);
        if (!$check->fetchColumn()) { $insert->execute($entry); $newTips++; }
    }
    return ['hotlines'=>$newHotlines, 'tips'=>$newTips];
}
