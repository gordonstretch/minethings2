<div id="fullcenter">

<div style="float:right">
<? echo $market->bidTable($minerBids, '/marketables/cancel/', 'Your Bids'); ?>
</div>

<h3>Buying <? echo $html->link($marketableDetails['name'], '/'.$marketableDetails['marketRRL']); ?><br></h3>

<? echo "<p>You have $numberInCity";
if ($cityName)
	echo " in $cityName";
echo ".</p>"; ?>

<?
if ($bestPrice['price'] > 0)
	echo "You can buy up to ".$bestPrice['quantity']." now for ".$market->commatize($bestPrice['price'])."g.";
echo $form->create(null, array('action' => 'buy/'.$marketableId));

// quantity
if ($hasLedger)
{
	$row = array(
		array($form->input( 'MarketOrder.quantity' ), array('style' => 'padding:0px;') ),
		array($html->image('minussign.png'), array('OnMouseUp' => 'document.getElementById("MarketOrderQuantity").value--', 'style' => 'padding:0px;')),
		array($html->image('plussign.png'), array('OnMouseUp' => 'document.getElementById("MarketOrderQuantity").value++', 'style' => 'padding:0px;')),
		);
	echo '<table cellspacing="0">'.$html->tableCells(array($row)).'</table>';
}

if ($bestPrice['price'] > 0)
{
	echo $form->input('MarketOrder.price', array('type' => 'hidden', 'value' => $bestPrice['price']));
	echo $form->end("Buy for ".$market->commatize($bestPrice['price'])."g");
}
else
	echo '<br><input type="button" value="[no listings]" disabled/></form><br><br>';
if (isset($buyMessage))
	echo $buyMessage;
?>
<BR>or place a bid:
<br>
<br>
<? 
echo $form->create(null, array('action' => 'buy/'.$marketableId)); 

// quantity
if ($hasLedger)
{
	$row = array(
		array($form->input( 'LimitOrder.quantity' ), array('style' => 'padding:0px;') ),
		array($html->image('minussign.png'), array('OnMouseUp' => 'document.getElementById("LimitOrderQuantity").value--', 'style' => 'padding:0px;')),
		array($html->image('plussign.png'), array('OnMouseUp' => 'document.getElementById("LimitOrderQuantity").value++', 'style' => 'padding:0px;'))
		);
	echo '<table cellspacing="0">'.$html->tableCells(array($row)).'</table>';
}

echo $form->input( 'LimitOrder.price' );

echo $form->end(array('label' => 'Place Bid'));
if (isset($bidMessage))
	echo $bidMessage;
?>

</div>
