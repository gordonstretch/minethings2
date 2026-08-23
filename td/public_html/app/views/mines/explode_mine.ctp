<div id="fullcenter">

<? foreach($explosivePrices as $e)
	if (count($e['Item']['Marketable']['LimitOrder']))
		echo $this->element('buy_form', array(
			'marketable' => $e['Item'], 
			'cityId' => $currentCityId, 
			'price' => $market->commatize($e['Item']['Marketable']['LimitOrder'][0]['price']), 
			'onComplete' => ' if (data.owned == 1) window.location = "/mines/explode_mine/'.$mine['id'].'";'));
?>

<div id="Explosion" style="display:none; float:right; position:relative">
<? echo $html->image('explosives/explosion.png'); ?>
</div>

<div id="Detonators" style="float:right">
<h3>Click to detonate:</h3>

<? function PrintCells($html, $explosives, $mineId, $condition, $count)
{
	foreach($explosives as $oei)
	{
		if ($oei[$condition])
		{
			$linkCount = ($count == 'max')
				? min($oei['maxAll'], $oei['count']) // maximium power
				: $count; // requested power (1x / 10x)

			if ($linkCount > $oei['maxAll'])
				continue; // blu-82 10x

			$url = '/mines/explode_mine/'.$mineId.'/'.$oei['explosiveId'].'/'.$linkCount;
			$cell = $html->link($html->image($oei['filename']), $url, array(
				'onclick' => "$('Detonators').hide(); $('Explosion').show(); $('LoadingDiv').show();", 'escape' => false));


		}
		else
			$cell = $html->image('explosives/none.png');
		echo $cell.' ';
	}
}

PrintCells($html, $explosives, $mine['id'], 'hasOne', 1);
echo "<H3>Bulk Rate (x$explosiveBulkRate):</H3>";
PrintCells($html, $explosives, $mine['id'], 'hasBulk', 10);
echo "<H3>Detonate Max:</H3>";
PrintCells($html, $explosives, $mine['id'], 'hasOne', 'max');	


foreach($explosivePrices as $e)
	if (count($e['Item']['Marketable']['LimitOrder']))
		print '<BR><BR>'.$this->element('buy_button', array(
			'marketable' => $e['Item'], 
			'price' => $market->commatize($e['Item']['Marketable']['LimitOrder'][0]['price'])));
?>
<BR><BR><? echo $html->link('Explosives Market', '/mine_types/browse/11'); ?>
</div>

<? 
$mine = $mine['mineTypeName']." mine (mining $mining):";
if (isset($explosiveCount) and isset($explosiveName))
	echo "<p>Detonating $explosiveCount $explosiveName(s) in your $mine</p>";
else
	echo "<p>Detonate explosives in your $mine</p>";
if ($bonus)
	echo '<p>'.$bonus.'% bonus!</p>';
?>

<h3>Findings:</h3>
<div style="height:600px; width: 400px; overflow:auto;">
<table class="things-table" summary="Findings">
<? 
$cells = array();
if ($attemptMade)
{
	if (!$ownsRequestedExplosives)
		$cells[] = 'You do not have enough of that type of explosive';
	else if (!isset($findings) || count($findings) == 0)
		$cells[] = 'Nothing found';
	else if (isset($findings))
		foreach($findings as $f)
		{
			if ($f['item_id'])
			{
				$link = $html->link($f['name'], '/items/view/'.$f['item_id']);
				if ($f['trashed'])
					$link.= ' (trashed)';
				if ($f['stolen'])
					$link.= ' (stolen)';

				$cells[] = array(array($link, array(
					'class' => 'item-'.$itemList->GetRarityClass($f['rarity']),
					'style' => 'white-space: nowrap; background-image:url('.$html->base.$f['icon'].')',
					)));
			}
			else if ($f['gold'])
				$cells[] = array($f['gold'].'g');
		}
}
echo $html->tableCells($cells, array('class' => 'even'), array('class' => 'odd'));
?>
</table>
</div>


</div>
