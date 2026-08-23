Mines available in <? echo $currentCityName; ?>:
<? foreach($localMineTypes as $type) {
	$link = $html->link($type['name'], '/items/browse/'.$type['id']); 
	if (isset($selectedMineTypeId) and $type['id'] == $selectedMineTypeId)
		$link = "*".$link."*";
	echo "$link ";
}?> 
<br><br>
Mines available elsewhere: 
<? foreach($foreignMineTypes as $type) {
	$link = $html->link($type['name'], '/items/browse/'.$type['id']); 
	if (isset($selectedMineTypeId) and $type['id'] == $selectedMineTypeId)
		$link = "*".$link."*";
	echo "$link ";
}
?>
<h3>Things</h3>


<? 
if (isset($items))
	echo $itemList->itemTable($items, $rarityColors, $isAdministrator); 
?>

<br><br>
<h3>Melds</h3>
<?
if (isset($melds))
	{
	foreach($melds as $meld)
		{
		// show a checkmark for each meld
		echo '<input type="checkbox" disabled ';
		if ($meld['hasMeld'])
			echo 'checked';
		echo '/>';

		print $html->link($meld['name'], '/melds/view/'.$meld['id']).": ";
			
		if (count($meld['items'])) 
		{
			$links = array();
			foreach($meld['items'] as $item)
				$links[] = $item['name'];
			print implode(", ", $links);
		}

		
		if ($isAdministrator) {
			print " ".$html->link('edit', '/melds/edit/'.$meld['id']);
			print " ".$html->link('delete', '/melds/remove_meld/'.$meld['id'], null, "Delete meld?? Are you sure?");
			}
		print "<br>";

		}
	if ($isAdministrator)
		echo $html->link('add', '/melds/add/'.$selectedMineTypeId);
	}
?>
