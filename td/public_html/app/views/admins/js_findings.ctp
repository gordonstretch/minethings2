<? echo $ajax->div('FindingsListDiv'); ?>
<table class="things-table" summary="Findings">
<?
foreach($findings as $f)
{
	$find = $f['treasure'];
	if ($f['dwarf'])
		$find.= ' (dwarf)';
	if ($f['stolen'])
		$find.= ' (stolen)';
	if ($f['rarity'] > 0)
		$find = array($find, array('class' => 'item-'.$itemList->GetRarityClass($f['rarity'])));
	echo $html->tableCells(array(array($find)));
}
?>
</table>
<? 
echo "<div id=\"FindingsLink$lastFindingId\">";
if ($lastFindingId != -1) echo $ajax->link('load more findings', '/admins/js_findings/'.$finderId.'/'.$lastFindingId, array('update' => 'FindingsListDiv', 'position' => 'bottom', 'loaded' => "$('FindingsLink$lastFindingId').hide();" )); 
?>
</div>
<? echo $ajax->divEnd('FindingsListDiv'); ?>