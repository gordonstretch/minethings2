<div id="fullcenter">

<? 

// show stats
print '<div style="float:right; margin:10px;">';
print "<table border=1>";
foreach($stats as $s)
{
	$value = $s['value'];
	$class = str_replace(' ', '', strtolower($s['name']));
	if (isset($s['highlight']) and $s['highlight'])
		$class.= ' highlight';
	$value = '<span class="'.$class.'">'.$value.'</span>';
	echo $html->tableCells(array(array($s['name'], $value)));
}
print "</table>";
print "</div>";

if (isset($routeStats))
{
	echo '<div style="float:right">';
	echo '<h3>Radar</h3>';
	echo '<table>';
	$headers = array_keys($routeStats['professionCounts']);	
	echo $html->tableHeaders($headers);
	echo $html->tableCells(array( $routeStats['professionCounts'] ));
	echo '</table>';
	echo '</div>';
}


print $form->create('MinersVehicle', array('url' => '/vehicles/check_status/'.$mvid));
print $form->input('MinersVehicle.id', array('type' => 'hidden'));
print "<table>";
$cells = array();
if (isset($tierRank))
{
	$cells[] = '<div style="display:inline; margin-right: 10px">'
		.$html->link($html->image('rankings/R'.$tierRank.'C1.png'), '/ratings', array('escape' => false))
		.'</div>';
}

$cells[] = $form->input('MinersVehicle.name', array('label' => ''));
if ($canRename)
	$renameButton = $form->end("Rename");
else
	$renameButton = '<button disabled>En Route</button>';
$cells[] = $renameButton;
print $html->tableCells(array($cells));
print "</table>";

print $html->link($item['name'], '/items/view/'.$item['id'],
array(
	'class' => $itemList->GetRarityClass($rarity),
	'style' => 'background-image:url('.$html->base.$icon.')',
))." from ".$departingCity;
if (isset($arrivingCity)) 
	echo " en route to ".$arrivingCity;
else if ($minersVehicle['MinersVehicle']['damaged'])
{
  echo " (damaged). ";
  echo "<p>This vehicle cannot be used because it is damaged.  If its rarity is blue or higher, you can repair it at a ".$html->link('factory', '/factories').'.  If its rarity is yellow or green, it cannot be repaired.  Champions become damaged when a new player attains top rank and cannot be repaired.</p>';
}
else if ($canUse)
	echo " ".$html->link('[send]', '/vehicles/send/'.$mvid);
if ($canEditCannons)
	echo ' '.$html->link('[cannons]', '/vehicles/attach_cannons/'.$mvid);
if ($canInstallMods)
{
	echo ' '.$html->link('[mods]', '/vehicles/mods/'.$mvid);
	echo ' '.$html->link('[weapons]', '/vehicles/weapons/'.$mvid);
}

?><BR><BR><?

// show which vehicle classes we are pillaging
if (isset($aggressiveFlags))
{
	$row = array();
	for ( $i = 1; $i <= 6; $i++)
	{
		if ($aggressiveFlags[$i] == 1)
			$row[] = array(
				$aggressiveAction,
				array('bgcolor' => $rarityColors[$i-1])
				);
	}
	if ($isThief)
	{
		if ($isShip)
			$other = 'Bounty Hunters';
		else
			$other = 'Guards';
		if ($minersVehicle['MinersVehicle']['aggressive_vs_sentry'])
			$action = $aggressiveAction;
		else
			$action = 'Flee';
		$row[] = "$action $other";
	}
	if (count($row))
	{
		echo "<table>";
		echo $html->tableCells(array($row));
		echo "</table>";
	}
}


echo '<br><br><div>';
echo '<div id="ErrorDiv"></div>';
echo 'Oil: ';
include 'load_oil.inc';

if (count($cannonsOnShip))
{
	echo '<BR>Ammo:';
	include 'load_ammo.inc';

	echo '<BR>';

	echo $form->create(null, array('action' => 'change_cannon_order/'.$mvid));
	echo $cannon->CannonTable($cannonsOnShip, true, true);
	if ($canSwapFiringOrder)
		echo $form->end(array('label' => 'Swap Firing Order'));
	else
		echo $form->end(array('label' => 'Cannot Swap Now', 'disabled' => true));
}
echo '</div>';

if (count($minersVehicle['Mod']))
{
	echo '<div>';
	
	foreach($minersVehicle['Mod'] as $m)
	{
		$element = '<div class="mod" style="
			height: 20px;
			color:'.$itemList->GetRarityColor($m['Item']['rarity']).'" >';
			
		$label = trim(strstr($m['Item']['name'], ' '));  // snip off first word
		$element.= $html->link('<span style="color:#555">'.$label.'</span>', '/items/view/'.$m['Item']['id'], array('escape' => false));
		
		$element.= '</div>';
		echo $element;
	}
	echo '</div>';
}

if (count($minersVehicle['Weapon']))
{
	echo '<div>';
	
	foreach($minersVehicle['Weapon'] as $w)
	{
		$element = '<div class="mod" style="
			background-color: #EEE; 
			height: 20px;
			color:'.$itemList->GetRarityColor($w['Item']['rarity']).'" >';
			
		$label = $w['Item']['name'];
		$element.= $html->link('<span style="color:#555; ">'.$label.'</span>', '/items/view/'.$w['Item']['id'], array('escape' => false));
		
		$element.= '</div>';
		echo $element;
	}
	echo '</div>';
}

?><div style="clear:both;"></div><?


if (isset($items))
{
	print "Cargo:";
	if (count($items))
		print $itemList->itemTable($items, $rarityColors, $isAdministrator);
	else
		print " None";

	echo "<BR>";
}

if (count($events))
{
	echo "<br><b>Past Events</b> ($routeCities as $profession):<br>";

	echo "<table border=1>";
	echo $html->tableHeaders(array('event', 'location', 'time', 'cargo', 'enemy'));
	foreach($events as $event)
	{
		$eventTypeName = $event['eventTypeName'];
		if ($event['battle_id'])
			$eventTypeName = $html->link($eventTypeName, '/battles/view/'.$event['battle_id'].'/'.$mvid);

		$cells = array(
			$eventTypeName,
			$event['location'],
			$event['time'],
			$event['items']
			);
		if (isset($event['enemyName']))
		{
			$cell = $html->link($event['enemyName'], '/miners/profile/'.$event['enemyName'])."'s ";
			if ($event['enemyRank'])
				$cell.= $html->image('rankings/R'.$event['enemyRank'].'C1.png', array('width' => 9, 'height' => 14, 'style' => 'margin-right: 3px'));
			$cell.= $html->link($event['enemyVehicleName'], '/items/view/'.$event['enemyVehicleItemId']);
			if ($event['enemyDirection'])
				$cell.= ' '.($event['enemyDirection'] == 1 ? 'v' : '^');
			$cells[] = $cell;
		}
		echo $html->tableCells(array($cells));
	}
	echo "</table>";	
}
?>

</div>
