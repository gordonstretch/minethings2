<?
if (isset($items))
{
	echo '<h2 id="things"></h2>';
	foreach($items as &$i)
		if ($i['price'])
			$i['name'] .= ' ('.$market->commatize($i['price']).'g)';
	echo $itemList->itemTable($items, $rarityColors, $isAdministrator); 
}
?>

<? if (isset($melds) and count($melds)): ?>
<h2 id="melds">Melds</h2>
<table class="things-table" summary="Things">
<tbody>
<?
foreach($melds as $m)
{
	$checkBox = '<input type="checkbox" disabled ';
	if ($m['hasMeld'])
		$checkBox.= 'checked';
	$checkBox.= '/>';
	
	$escapeTitle = false;
	$meldDescription = $html->link($m['name'].": ", '/melds/view/'.$m['id'], array('escape' => false));
	if (isset($m['items']))
		$meldDescription.= " ".$m['items'];

	$cells = array( $checkBox );
	if ($hasMedalDetector)
		$cells[] = $m['price'];
	$cells[] = array($meldDescription, array('class' => 'item-'.$itemList->GetRarityClass($m['rarity']) )) ;

	if ($isAdministrator) {
		$cells[] = $html->link('edit', '/melds/edit/'.$m['id']);
		$cells[] = $html->link('delete', '/melds/remove_meld/'.$m['id'], null, "Delete meld?? Are you sure?");
	}

	echo $html->tableCells( array($cells) );
}
?>
</table>
<?
if ($isAdministrator) 
	echo '<BR>'.$html->link('add', '/melds/add/'.$selectedMineTypeId);
?>

<? endif; ?>
