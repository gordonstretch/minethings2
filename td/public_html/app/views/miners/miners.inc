<ul class="list-miners">
<table>
<?
foreach($miners as $miner)
{
	$name = $html->link( $miner['Miner']['name'], "/miners/profile/".$miner['Miner']['name'] );
	$tierRank = false;
	foreach($miner['Rating'] as $r)
		if ($r['tier_id'] and $r['class'] == 4)
			foreach($professions[$r['route_type']] as $p)
				if ($miner['Miner']['profession'] == $p)
				{
					$tierRank = $tiers[$r['tier_id']]['Tier']['rank'];
					$vehicleCount = $r['vehicle_count'];
				}
	if ($tierRank)
		$name = $rank->ImageLink($tierRank, $vehicleCount, array('width' => 9, 'height' => 14, 'style' => 'margin-right: 3px'))
			.$name;
	
	echo $html->tableCells(array(array(
		array($name, array('width' => '120')),
		"(".$miner['Miner']['meld_count'].")",
		$miner['profession'],
		$miner['homeCity'],
		)));
}
?>
</table>
</ul>
	
<?
$paginator->options(array(
	'update' => 'MinersListDiv', 
	'indicator' => 'LoadingDiv',
	'url' => array('controller' => 'miners', 'action' => 'js_list_miners')));
echo $paginator->prev('<< Previous', null, '<< Previous ', array('tag' => 'span'));
echo ' '.$paginator->numbers(); 
echo ' '.$paginator->next('Next >>', null, ' Next >>', array('tag' => 'span'));

?>
      