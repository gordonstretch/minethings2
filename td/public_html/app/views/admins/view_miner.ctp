<div id="fullcenter">

<span style="float:right">
<H3>Findings</H3>
<div id="FindingsListDiv"></div>
<div id="FindingsLink">
<? echo $ajax->link('load findings', '/admins/js_findings/'.$miner['id'], array('update' => 'FindingsListDiv', 'position' => 'bottom', 'loaded' => "$('FindingsLink').hide();" )); ?>
</div>
</span>



<?
echo $miner['id'].' '.$html->link($miner['name'], '/miners/profile/'.$miner['name']).' '.$miner['gold'].'g '.$miner['credits'].'c '.$miner['created'].'<BR>';
echo $miner['meld_count'].' melds '.$miner['item_limit'].' item limit.  Tut '.$miner['tutorial_stage_id'].'<BR>';
echo $html->link('vehicles', '/vehicles/browse/vehicles/'.$miner['name']).'<br>';
echo $html->link('ships', '/vehicles/browse/ships/'.$miner['name']).'<br>';
echo $html->link('aircraft', '/vehicles/browse/aircraft/'.$miner['name']).'<br>';
echo $html->link('trash', '/admins/trash_miner/'.$miner['id']).'<br>';
echo $html->link('reset pass', '/admins/reset_password/'.$miner['id']).'<br>';
echo $html->link(($pmBan?'un':'').'ban from pms', '/admins/ban_from_pm/'.$miner['id']).'<br>';
echo $html->link(($chatBan?'un':'').'ban from chat', '/admins/ban_from_chat/'.$miner['id']).'<BR>';
?>

<H3>Mines</H3>
<table>
<?
echo $html->tableHeaders(array('Type', 'Active', 'Expires', 'Gold'));
foreach($mines as $m)
	echo $html->tableCells(array($m['type'], $m['active'], $m['expires'], $m['miningGold']));
?></table>

<H3>Sales</H3>
<div id="SalesDiv"></div>
<div id="SalesLink">
<? echo $ajax->link('load sales', '/admins/js_miner_sales/'.$miner['id'], array('update' => 'SalesDiv', 'position' => 'bottom', 'loaded' => "$('SalesLink').hide();" )); ?>
</div>

<h3>Actions</h3>
<div id="ActionsDiv"></div>
<div id="ActionsLink">
<? echo $ajax->link('load actions', '/admins/js_miner_actions/'.$miner['id'], array(
	'update' => 'ActionsDiv', 
	'position' => 'bottom', 
	'loaded' => "$('ActionsLink').hide();" )); ?>
</div>

<script>$('ActionsDiv').observe('click', function(event) {
	var a = event.findElement('a');
	if (a) {
		a.next().toggleClassName('hidden');
	}
	event.stop();
});
</script>


<H3>Transfers</H3>
<div id="TransfersDiv"></div>
<div id="TransfersLink">
<? echo $ajax->link('load transfers', '/admins/js_transfers/'.$miner['id'], array('update' => 'TransfersDiv', 'loaded' => "$('TransfersLink').hide();" )); ?>
</div>


<H3>Log</H3>
<table>
<?
foreach($log as $l)
	echo $html->tableCells(array(array($l['created'], $l['ip'])));
?>
</table>

<H3>Exchanges</H3>
<table>
<?
foreach($exchanges as $e)
	echo $html->tableCells(array(array($e['description'], $e['credits'], $e['created'])));
?>
</table>

<H3>Images</H3>
<table>
<?
foreach($images as $i)
	echo $html->tableCells(array(array(
		$html->link($i['itemName'], '/items/view/'.$i['itemId']),
		$i['accepted']
		)));
?>
</table>

<!-- table of things tables-->
<table><tr>

<td>
<H3>Vehicles</H3>
<table class="things-table" summary="Findings">
<?
foreach($vehicles as $v)
{
	$thing = $html->link($v['name'], '/items/view/'.$v['id']);
	$vehicle = array($thing, array('class' => 'item-'.$itemList->GetRarityClass($v['rarity'])));
	echo $html->tableCells(array(array($vehicle)));
}
?>
</table>
</td>

<td>
<H3>Weapons</H3>
<table class="things-table" summary="Findings">
<?
foreach($weapons as $w)
{
	$thing = $html->link($w['name'], '/items/view/'.$w['id']);
	$thing = array($thing, array('class' => 'item-'.$itemList->GetRarityClass($w['rarity'])));
	echo $html->tableCells(array(array($thing)));
}
?>
</table>
</td>

<td>
<H3>Equipment</H3>
<table class="things-table" summary="Findings">
<?
foreach($equipment as $e)
{
	$thing = $html->link($e['name'], '/items/view/'.$e['id']);
	$thing = array($thing, array('class' => 'item-'.$itemList->GetRarityClass($e['rarity'])));
	echo $html->tableCells(array(array($thing)));
}
?>
</table>
</td>

</table> <!-- end of table of things tables -->

</div>
