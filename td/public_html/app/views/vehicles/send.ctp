<?
echo $javascript->link('vehicle_send09.js');
function StatSpan($name, $value, $highlight) {	
	if ($highlight) $name.= ' highlight';
	return '<span class="'.$name.'">'.$value.'</span>'
		.'<script type="text/javascript">SaveStat("'.$name.'", "'.$value.'");</script>';
}
?>


<div id="fullcenter">

<?
print '<div style="float:right; margin:10px;">';
print "<table border=1>";
foreach($stats as $s)
{
	$name = str_replace(' ', '', strtolower($s['name']));
	$value = StatSpan($name, $s['value'], isset($s['highlight']) ? $s['highlight'] : false);
	echo $html->tableCells(array(array($s['name'], $value)));
}
print "</table>";
print "</div>";


echo "<table><tr><td valign=top>";
echo "<h3>Sending ".$vehicleName;
if (strlen($minersVehicle['MinersVehicle']['name']))
	echo ' "'.$minersVehicle['MinersVehicle']['name'].'"';
echo " from ".$cityName." as ".$profession."</h3>";
echo $html->link('[status]', '/vehicles/check_status/'.$minersVehicle['MinersVehicle']['id']);
echo "</td><td>";

if (isset($routeStats) and count($routeStats))
{
	echo '</td><td>';
	echo '<h3>Radar</h3>';
	echo '<table>';
	$headers = array_merge(array('route'), array_keys($routeStats[0]['professionCounts']));	
	echo $html->tableHeaders($headers);
	foreach($routeStats as $s)
	{
		$data = array_merge(array($s['name']), $s['professionCounts']);
		echo $html->tableCells(array( $data ));
	}
	echo '</table>';
}
echo "</td></tr></table>";

echo $form->create('Vehicle', array('action' => 'confirm_send'));
echo $form->input("MinersVehicle.id", array('type' => 'hidden', 'value' => $minersVehicleId));

// Route options
// insert a blank option at the top to ensure they choose something
if (count($routes) > 1)
	$routes = array_merge(
		array(array('Route' => array('id' => 0), 'length' => '-', 'destination' => '----------------')), 
		$routes);
$options = array();
foreach($routes as $r)
	$options[$r['Route']['id']] = $r['destination']." (".$r['length']."km)";
echo $form->input('MinersVehicle.route_id', array('options' => $options, 'onchange' => "UpdateUI(forms['VehicleConfirmSendForm'])"));

echo "<br>";
// "aggressive vs" table
if ($showAggressiveTable)
{
	echo "Colors to Chase and ".$aggressiveAction.":<br>";
	echo "<table>";
	$row = array();
	foreach($allowedAggressives as $i)
		$row[] = array(
			$form->input('MinersVehicle.aggressive_vs_'.$i, array('label' => $aggressiveAction, 'class' => 'AggCheckbox', 'onchange' => "UpdateUI(forms['VehicleConfirmSendForm'])")),
			array('bgcolor' => $rarityColors[$i-1])
			);
	if ($isThief or $isSentry) {
		if ($isShip)
			$label = $aggressiveAction.' Bounty Hunters';
		else
			$label = $aggressiveAction.' Guards';
		$row[] = $form->input('MinersVehicle.aggressive_vs_sentry', array('label' => $label, 'id' => 'AggSentry', 'onchange' => "UpdateUI(forms['VehicleConfirmSendForm'])"));
	}
	echo $html->tableCells(array($row));
	echo "</table>";
}

echo '<br>';

?>

<!--<div style="clear:both"></div>-->
<?

if (!$inDebt and !$atVehicleLimit and count($itemsByMine))
	echo '<input type="button" value="Send" class="send_button" onclick="$(\'VehicleConfirmSendForm\').submit(); return false;" />';
	
echo '<BR><BR><div>';
echo '<div id="ErrorDiv"></div>';
echo 'Load: ';
include 'load_oil.inc';
if ($isShip and count($minersVehicle['MinersShip']['CannonsShip']))
{
	include 'load_ammo.inc';
}
echo '</div>';

	
if (count($itemsByMine))
{
	echo "<br>Items to bring: ";	
	echo '(Capacity Remaining: '.StatSpan('capacity', $capacity, false).') | ';
	echo '<a href="#" onclick="SelectPrevious(false); return false;" >Prev</a> | ';
	echo '<a href="#" onclick="SelectPrevious(true); return false;" >Prev Arms</a> | ';
	echo '<a href="#" onclick="ClearAll(forms[\'VehicleConfirmSendForm\']); return false;" >Clear</a>';
	echo '<BR>';

	foreach($itemsByMine as $mineName => $items)
	{
		echo '<input id="allbox_'.$mineName.'" type=checkbox onclick="CheckAll(forms[\'VehicleConfirmSendForm\'], \''.$mineName.'\');" name="allbox_'.$mineName.'"/>';
		echo '<label for="allbox_'.$mineName.'">'.$mineName.'</label>';
		foreach($items as &$i)
		{
			$i['class'] = $mineName;
			if ($i['checked'])
			{
				$i['checked'] = false;
				$i['class'].= ' cargo';
				if (in_array($i['id'], $armsIds))
					$i['class'].= ' arms';
			}
			else
				$i['class'].= ' inventory';
		}
		unset($i);
		$checkboxes = $itemList->itemTableCheckbox($items, $rarityColors, $isAdministrator);
		// insert onchange handler
		$checkboxes = preg_replace('/(type="checkbox")/', '\1 onclick="UpdateUI(forms[\'VehicleConfirmSendForm\']);"', $checkboxes);
		echo $checkboxes;
	}
	
	echo '(Capacity Remaining: '.StatSpan('capacity', $capacity, false).') ';

}

if (!$inDebt and !$atVehicleLimit)
	echo $form->end(array('label' => 'Send', 'name' => 'send_button', 'class' => 'send_button'));
else 
{
	echo $form->end(); // hidden
	echo '<input type=button value="Send" disabled/>';
	if ($inDebt)
		echo "<font color=CC0000>You are in debt and cannot use any routes until you have at least 0 gold.</font>";
	else if ($atVehicleLimit)
		echo "<font color=CC0000>You have reached the maximnum number of active aircraft.</font>";
}


?>

</div>

<script type="text/javascript">
var statNames = <? echo json_encode($statNames); ?>; 
var offenseMultiplier = <? echo $offenseMultiplier; ?>;
var defenseMultiplier = <? echo $defenseMultiplier; ?>;
</script>
