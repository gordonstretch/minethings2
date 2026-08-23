<div id="fullcenter">

<H2><? echo $displayName; ?></H2>

<?

echo $form->create(null, array('action' => 'ledger'));
echo $form->input('Ledger.month', array('options' => $months));
echo $form->end('Go');

?>

<? if(count($sales)): ?>

<table style="float:right">
<?
echo $html->tableCells(array(
	array('Total Purchases', $market->commatize($totalPurchases).'g'),
	array('Total Sales', $market->commatize($totalSales).'g'),
	array('Profit From Sales', $market->commatize($profitFromSales).'g'),
	));
?>
</table>


<H3>Purchases and Sales</H3>
<table>
<?
foreach($sales as $s)
	echo $html->tableCells(array(
		$s['action'],
		$html->link($s['name'], '/'.$s['rrl']),
		$s['quantity'].'x'.$market->commatize($s['price']).'g',
		$s['created'],
		));

?>
</table>

<? endif ?>


</div>
