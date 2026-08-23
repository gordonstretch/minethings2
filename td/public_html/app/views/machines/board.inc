<? echo $javascript->link('machines11.js'); ?>

<div id="board"></div>

<script type="text/javascript">

hexes = <? echo json_encode($hexes); ?>;
machines = <? echo json_encode($machines); ?>;
//hexesMachines = <? //echo json_encode($hexesMachines); ?>;
miners = <? echo json_encode($minerMap); ?>;
machineTypes = <? echo json_encode($machineTypes); ?>;
ownedMachines = <? echo json_encode($ownedMachines); ?>;
minerId = <? echo $minerId; ?>;
hasHeli = <? echo $hasHeli; ?>;
hexDiameter = 30.0; // hex side to side	
cartVector = [.86602540378, 0.5]; // 30 degrees unit vector
unitsPerBarrel = <? echo $unitsPerBarrel; ?>;
unitsPerLiter = <? echo $unitsPerLiter; ?>;
oilspill = <? echo $oilspill; ?>;
popup = null;
animate = <? echo $animated ? 1:0; ?>;
boardMachines = [];
boardHexes = [];
queuedMachines = [];
showQueued = false;
teamFill = true;
dialog = new Dialog();
timeLastChecked = <? echo $timeLastChecked; ?>;
timeOffset = <? echo time(); ?> - (new Date()/1000);

</script>

<div style="float:right">

<a href="javascript:void();" onclick="ToggleQueued();">show queued</a> | 
<? echo $ajax->link('toggle animation', '/machines/js_animated', array('onclick' => 'ToggleAnimation();')); ?>
 | <a href="javascript:void();" onclick="ToggleBoardColors();">toggle colors</a>
</div>

<h3>Instructions</h3>
<ul>
<li>You must own machine parts in <? echo $cityName; ?> and be a pilot to use the oil field.</li>
<li>Click on a machine you own (above the grid) to begin.</li>
<li>Blue hexes indicate the available build radius.</li>
<li>Deploying will install the machine immediately.</li>
<li>A queued machine will deploy when the current machine expires.</li>
<li>Once deployed or queued, machines cannot be moved or rotated.</li>
<li>Click a deployed pad you own to claim a barrel.</li>
</ul>	

<? if (!$hasHeli) echo "<p>Get a ".$html->link('Helicopter', '/items/view/'.$helicopterId)." to $cityName to increase build radius by one.</p>"; ?>
<? if (!$hasSearch) echo "<p>Get a ".$html->link('Search Plane', '/items/view/'.$searchPlaneId)." to $cityName to view all oil data.</p>"; ?>
<? if (!$hasBomber) echo "<p>Get a ".$html->link('Bomber', '/items/view/'.$bomberId)." and bombs to $cityName to enable bombing.</p>"; ?>

<table>
<? if ($stats)
{
	echo $html->tableHeaders(array('Miner', 'Machines', 'Oil', 'Pumping', 'Packing', 'Barrels'));
	foreach($miners as $m)
		echo $html->tableCells(array(
			$html->link($m['Miner']['name'], '/miners/profile/'.$m['Miner']['name']).' ('.$m['Miner']['meld_count'].')',
			$m['machines'],
			$m['oil'].'L',
			$m['pumping'].'L/h',
			$m['packing'].'L/h',
			$m['barrels'],
			));
}
?>
</table>
