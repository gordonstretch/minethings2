<div id="fullcenter">

<table style="text-align:right">
<?
echo $html->tableHeaders(array('', '', 'Credits', 'Owned', 'Spread', 'Gld/Cdt'));
$rows = array();
foreach($citiesAndMines as $city)
{
	$rows[] = array('<b>'.$city['name'].':</b>');
	foreach($city['mines'] as $mine)
	{
		$name = $mine['name'];
		//$listing = $mine['listing'] ? $market->commatize($mine['listing']).'g' : '[none]';
		//$bid = $mine['bid'] ? $market->commatize($mine['bid']).'g' : '[none]';
		$spread = $market->spread(array($mine['bid'], $mine['listing']));
		if ($mine['url'])
			$spread = $html->link($spread, $mine['url']);
			
		$gpc = $mine['goldPerCredit'].' g/c';
		if (isset($mine['bestGpc']))
			$gpc = "<B>$gpc</B>";

		$rows[] = array(
			$html->image('icons/mine.gif', array('align' => 'right')), 
			$name, 
			array($mine['credits'], array('style' => 'text-align:right', 'width' => '70px')),
			array($mine['numberOwned'], array('style' => 'text-align:right')),
			$spread,
			$gpc,
			);
	}
}
echo $html->tableCells($rows);
?>
</table>

<p style="text-align:center; font-size:large">
<? echo $html->link("Buy More Credits", '/credits/buy'); ?> 
</p>

</div>
