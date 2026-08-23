	<div id="fullcenter">

<div style="float:right">
<? echo $market->listingTable($minerListings, '/marketables/cancel/', 'Your Listings'); ?>
</div>

<h3>Selling <? echo $html->link($marketableDetails['name'], '/'.$marketableDetails['marketRRL']); ?><br></h3>

<? echo "<p>You have $numberSellableInCity you can sell";
if ($cityName)
	echo " in $cityName";
echo ".</p>"; ?>

<?
if ($numberSellableInCity)
{
	if ($bestPrice['price'] > 0)
	{
		$canSell = min($bestPrice['quantity'], $numberSellableInCity);
		echo "You can sell up to ".$canSell." at this price:";
	}
	echo $form->create(null, array('action' => 'sell/'.$marketableId));
	
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
		echo $form->end("Sell for ".$market->commatize($bestPrice['price'])."g");
	}
	else
		echo '<br><input type="button" value="[no bids]" disabled/></form><br><br>';
	if (isset($sellMessage))
		echo $sellMessage;
	echo "<br>or place a listing:";
	echo "<br>";
	echo "<br>";
	echo $form->create(null, array('action' => 'sell/'.$marketableId)); 

	// quantity
	if ($hasLedger)
	{
		$row = array(
			array($form->input( 'LimitOrder.quantity' ), array('style' => 'padding:0px;') ),
			array($html->image('minussign.png'), array('OnMouseUp' => 'document.getElementById("LimitOrderQuantity").value--', 'style' => 'padding:0px;')),
			array($html->image('plussign.png'), array('OnMouseUp' => 'document.getElementById("LimitOrderQuantity").value++', 'style' => 'padding:0px;')),
			);
		echo '<table cellspacing="0">'.$html->tableCells(array($row)).'</table>';
	}
	
	echo $form->input( 'LimitOrder.price' );
	echo $form->end("Place Listing");
	if (isset($listingMessage))
		echo $listingMessage;
}
?>


</div>
