<?
echo $html->link('Profession Stats', '/admins/profession_stats').' ';

echo $html->link('Back', '/admins/route_history/'.$skipYellows.'/'.($quarterCount+1)).' ';
if ($quarterCount == 0)
	echo 'Forward';
else
	echo $html->link('Forward', '/admins/route_history/'.$skipYellows.'/'.($quarterCount-1)).' ';
if ($skipYellows)
	echo $html->link('Show Yellows', '/admins/route_history/0/'.$quarterCount);
else
	echo $html->link('Hide Yellows', '/admins/route_history/1/'.$quarterCount);

echo "<BR>$date<BR>";

?>
<br>
<span style="font-size:12px">
<?
if (isset($events))
{
	echo "<table border=1>";
	$rows = array();
	foreach($events as $e)
	{


		if ($e == 'separator')
			$rows[] = array('-');
		else
		{
			$itemsGained = array();
			foreach($e['itemsGained'] as $i)
			{
				if (!isset($itemsGained[$i['id']]))
					{
					$itemsGained[$i['id']] = $i;
					$itemsGained[$i['id']]['quantity'] = 0;
					}
				$itemsGained[$i['id']]['quantity']++;
			}
			$itemsGainedString = '';
			foreach($itemsGained as $i)
			{
				$rarityColor = $itemList->GetRarityColor($i['rarity']);
				$itemsGainedString.= "<span style=\"background-color:$rarityColor;\">"
					.$i['name']
					."</span>";
				if ($i['quantity'] > 1)
					$itemsGainedString.=' x'.$i['quantity'];
				$itemsGainedString.=', ';
			}
			
			if ($e['oilGained'])
				$itemsGainedString.= ", $e[oilGained] oiled trips";

			$itemsGainedString = rtrim($itemsGainedString, ',');
			$vehicleColor = $itemList->GetRarityColor($e['vehicleRarity']);

			$eventTypeName = $e['eventTypeName'];
			if ($e['battleId'])
				$eventTypeName = $html->link($eventTypeName, '/battles/view/'.$e['battleId'].'/'.$e['minersVehicleId']);

			$vehicleLink = $html->link($e['vehicleName'], '/items/view/'.$e['vehicleItemId']);

			$rows[] = array( 
				array($e['cityNames'], array('style' => 'background-color:'.($e['isSea'] ? '#AAAAFF' : '#AAFFAA'))),
				$html->link($e['minerName'], '/miners/profile/'.$e['minerName']).' ('.$e['profession'].')',
				$html->link($e['minersVehicleId'], '/vehicles/check_status/'.$e['minersVehicleId']),
				array($vehicleLink, array('style' => 'background-color:'.$vehicleColor)),
				$eventTypeName, 
				$e['location'], 
				$e['time'], 
				$itemsGainedString);
		}
	}
	echo $html->tableCells($rows);
	echo "</table>";
}
?>
</span>
