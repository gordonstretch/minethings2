<span style="font-size:12px">
<table>
<?
echo $html->tableHeaders(array('Buyer', 'Seller', 'Item', 'Price', 'Quantity', 'City', 'Bid'));
foreach ($sales as $s)
	echo $html->tableCells(array(array(
		$html->link($s['buyer_name'], '/miners/profile/'.$s['buyer_name']),
		$html->link($s['seller_name'], '/miners/profile/'.$s['seller_name']),
		$html->link($s['name'], '/marketables/market/'.$s['marketable_id']),
		$s['price'].'g',
		$s['quantity'],
		$s['city'],
		$s['bid'],
		$s['date'],
		)));
?>
</table>
</span>