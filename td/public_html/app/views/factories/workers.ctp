<div id="fullcenter">

<H2>Worker market in <? echo $currentCityName; ?></H2>

<table>
<? 
echo $html->tableHeaders(array('Market', 'Price')); 
foreach($markets as $m)
{
	if ($m['price'])
		$price = $market->commatize($m['price']).'g';
	else
		$price = '';
	$row = array(
		$html->link($m['name'], '/'.$m['rrl']),
		$html->link($price, '/'.$m['rrl']),
		);
	echo $html->tableCells(array($row));
}
?>
</table>


</div>
