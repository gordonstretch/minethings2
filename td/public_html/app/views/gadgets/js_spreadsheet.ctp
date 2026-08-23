<table>
<?
echo $html->tableHeaders(array(
	'Thing', 
	'Listings', '', 
	'Bids', '', 
	'Profit',
	'Percent'));
foreach($trades as $t)
	echo $html->tableCells(array(array(
		$html->link($t['itemName'], '/items/view/'.$t['itemId']),
		$t['buyCity'],
		$market->commatize($t['buyPrice']).'g',
		$t['sellCity'],
		$market->commatize($t['sellPrice']).'g',
		$t['profit'],
		$t['percent']
		)));
?>
</table>
