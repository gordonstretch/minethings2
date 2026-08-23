<? if (count($findings)): ?>
	<table class="things-table" summary="Findings">
	<?
	$cells = array();
	foreach($findings as $f)
	{
		if ($f['item_id'])
		{

			$title = date('m/d H:i', $f['time']);
			if ($f['mine_id'])
				$title = $f['mine_id'].': '.$title;

			$find =  $html->link($f['item_name'], '/items/view/'.$f['item_id'], array('title' => $title));

			if ($f['trashed'])
				$find.= ' (trashed)';
			else if ($f['stolen'])
				$find.= ' (stolen)';
			else if ($f['dwarfed'])
				$find.= ' (dwarf)';

		}
		else if ($f['gold'])
		{
			$find = $f['gold']." gold";
		}

		if (isset($f['new']))
			$find = "New: ".$find;

		$cell = array($find);

		if (isset($f['rarity']))
			$cell = array(array($find, array(
			'class' => 'item-'.$itemList->GetRarityClass($f['rarity']),
			'style' => 'white-space: nowrap; background-image:url('.$html->base.$f['icon'].')',
			)));	
		$cells[] = $cell;
	}
	echo $html->tableCells($cells, array('class' => 'even'), array('class' => 'odd'));
	?>
	</table>
<? endif; ?>
