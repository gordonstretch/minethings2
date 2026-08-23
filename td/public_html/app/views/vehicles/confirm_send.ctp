<div id="fullcenter">

<?
print '<div style="float:right; margin:10px;">';
print "<table border=1>";
foreach($stats as $s)
	echo $html->tableCells(array(array($s['name'], $s['value'])));
print "</table>";
print "</div>";

echo "<h2>Confirmation</h2>";

echo "<h4>Sending ".$vehicleName." from ".$cityName." as <u>".$profession."</u></h4>";
echo "<h4>Note that if this vehicle or its cargo are listed in the market, all listings will be canceled.</h4>";

echo $form->create(null, array('action' => 'process_send'));
echo $form->input("MinersVehicle.id", array('type' => 'hidden'));
echo $form->input("MinersVehicle.route_id", array('type' => 'hidden'));
foreach($itemCounts as $id => $count)
	echo $form->input('Item.'.$id, array('type' => 'hidden', 'value' => $count));
	//echo $form->input("ItemsMiner.".$i['itemsMinerId'].".selected", array('type' => 'hidden', 'value' => 1));


echo "Route to: ".$destinationCityName;
echo "<BR>Departure time: ";
if (isset($departureTime))
	echo $time->timeago($departureTime);
else
	echo 'immediately';
	
if (isset($publishTime))
	echo '<BR/><BR/><b>Rare cargo will be reported '.$time->timeago($publishTime).'.</b>';

// "aggressive vs" table{
if ($isThief or $isSentry)
{
	$row = array();
	foreach($allowedAggressives as $i)
	{
		echo $form->input('MinersVehicle.aggressive_vs_'.$i, array('type' => 'hidden'));

		if ($aggressiveVsRarities[$i] == 1)
			$row[] = array(
				$aggressiveAction,
				array('bgcolor' => $rarityColors[$i-1])
				);
	}

	echo $form->input('MinersVehicle.aggressive_vs_sentry', array('type' => 'hidden'));

	if ($isThief or $isSentry)
	{
		if ($isShip)
			$other = 'Bounty Hunters';
		else
			$other = 'Guards';
		if ($this->data['MinersVehicle']['aggressive_vs_sentry'])
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


?><div style="clear:both"></div><?

echo "<br>Items to bring:<br>";
if (count($cargo))
	echo $itemList->itemTable($cargo, $rarityColors, $isAdministrator);
else
	echo "None";

if (isset($cargoMissing))
	echo '<BR><font class="error">Some cargo could not be loaded!  Click '.$html->link('here', 'send/'.$this->data['MinersVehicle']['id']).' to go back.</font>';

echo $form->end("Confirm");

?>

</div>
