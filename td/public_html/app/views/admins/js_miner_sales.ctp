<? echo $ajax->div('SalesDiv'); ?>
<span style="font-size:12px">
<table>
<? echo $html->tableHeaders(array('Buyer', 'Seller', 'Item', 'City', 'Price', 'Bid', 'Created')); 
foreach($thingSales as $s)
	echo $html->tableCells(array($s['buyer'], $s['seller'], $s['item'], $s['city'], $s['price'], $s['bid'], $s['created']));
?>
</table></span>
<? 
echo "<div id=\"SalesLink$lastSaleId\">";
echo $ajax->link('load more sales', '/admins/js_miner_sales/'.$profileId.'/'.$lastSaleId, array('update' => 'SalesDiv', 'position' => 'bottom', 'loaded' => "$('SalesLink$lastSaleId').hide();" )); 
?>
</div>
<? echo $ajax->divEnd('SalesDiv'); ?>