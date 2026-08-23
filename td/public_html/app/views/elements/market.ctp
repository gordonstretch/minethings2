<div id="MarketDiv">
<?
// buy/sell form
echo $ajax->form(array('type' => 'post', 'options' => array(			
	'style' => 'display:none',
	'url' => '/marketables/js_market',
	'indicator' => 'LoadingDiv',
	'update' => 'MarketDiv',
	))); 
echo $form->input('Marketable.id', array('type' => 'hidden', 'value' => $marketData['marketableId']));
echo $form->input('LimitOrder.new', array('type' => 'hidden', 'value' => 1, 'id' => 'NewLimitOrder')); // fill this in for buy-now/sell-now
echo $form->input('LimitOrder.bid', array('type' => 'hidden', 'value' => 0, 'id' => 'LimitOrderBid'));
echo $form->input('LimitOrder.city_id', array('type' => 'hidden', 'value' => $marketData['cityId']));
echo $form->input('LimitOrder.price', array('type' => 'hidden', 'value' => 0, 'id' => 'LimitOrderPrice'));
echo $form->input('LimitOrder.quantity', array('type' => 'hidden', 'value' => 1, 'id' => 'LimitOrderQuantity'));
echo $form->end(array('id' => 'MarketSubmit', 'label' => 'Submit'));

echo "<table cellspacing=0 cellpadding=0>";

#market order row
echo "<tr>";

$confirm = (!$marketData['bestOtherListing'] or ($marketData['bestOtherListing']['price'] >= 500));
function onenter($okd)
{
	return 'onkeydown = "if(window.event) key = window.event.keyCode; 
	else key = event.which; 
	if (key == 13) { '.$okd.' }"';
}

#sell
echo "<td>";
echo '<H3>Sell</H3>';
$canSellNow = $marketData['bestOtherBid'];

echo '<div style="width:160px">';
if ($canSellNow)
{
	$sellNow = 
		 "$('LimitOrderPrice').value = ".$marketData['bestOtherBid']['price'].";"
		."$('NewLimitOrder').value = 0;"
		."$('LimitOrderBid').value = 1;"
		."$('LimitOrderQuantity').value = $('SellNowQuantity').value;"
		."$('MarketSubmit').click();"
		."return false;";
	echo $html->link('[Sell for '.$market->commatize($marketData['bestOtherBid']['price']).'g]', '#', array(
		'onclick' => $confirm ? '$(\'SellNowDiv\').show(); return false;' : $sellNow, 
		'escape' => false));
	
}
else
{
	echo '[no bids]';
	$sellNow = ';';
}
echo '<span class="Quantity" style="display:none"> x<input style="display:inline; width:20px;" id="SellNowQuantity" value="1" '.onenter($sellNow).'></input></span>';
echo '<div id="SellNowDiv" style="display:none;"><button onclick="'.$sellNow.'">Confirm</button></div>';
echo '</div>';

$maxNow = $marketData['sellable'];
if ($marketData['bestOtherBid'])
	$maxNow = min($maxNow, $marketData['bestOtherBid']['quantity']);
$maxList = $marketData['sellable'];
echo '<div id="SellQuantityButtons" style="display:'.($hasLedger?'block':'none').';">';
$ledgerError = '$("SellQuantityButtons").update("Requires ledger gadget"); return false;';
echo $html->link('[-]', '#', array('onclick' => !$hasLedger ? $ledgerError : 
	'$$(".Quantity").each(Element.show);
	$("SellNowQuantity").value = Math.max(1, parseInt($("SellNowQuantity").value) - 1); 
	$("ListQuantity").value = Math.max(1, parseInt($("ListQuantity").value) - 1);
	return false;'));
echo ' '.$html->link('[+]', '#', array('onclick' => !$hasLedger ? $ledgerError : 
	'$$(".Quantity").each(Element.show);
	$("SellNowQuantity").value = Math.min('.$maxNow.', parseInt($("SellNowQuantity").value) + 1); 
	$("ListQuantity").value = Math.min('.$maxList.', parseInt($("ListQuantity").value) + 1);
	return false;'));
echo ' '.$html->link('[max]', '#', array('onclick' => !$hasLedger ? $ledgerError : 
	'$$(".Quantity").each(Element.show);
	$("SellNowQuantity").value ='.$maxNow.'; 
	$("ListQuantity").value = '.$maxList.'; 
	return false;'));
echo '</div>';
echo '<BR>';

echo '<div>';
$submitListing = "
	$('LimitOrderPrice').value = $('ListPrice').value;
	$('NewLimitOrder').value = 1;
	$('LimitOrderBid').value = 0;
	$('LimitOrderQuantity').value = $('ListQuantity').value;
	$('MarketSubmit').click();
	return false;";
	
echo '<input id="ListPrice" type="text" size="3" value="'.$marketData['listingStart'].'" '.onenter($submitListing).'/>';
echo '<span class="Quantity" style="display:none"> x<input id="ListQuantity" style="display:inline; width:20px;" value="1" '.onenter($submitListing).'/></span> ';
echo $html->link('[List]', '#', array('onclick' => $submitListing));
echo '</div>';
echo '</td>';

#buy
echo '<td>';
echo '<H3>Buy</H3>';
$canBuyNow = $marketData['bestOtherListing'];

echo '<div style="width:160px">';
if ($canBuyNow)
{
	$buyNow = 
		 "$('LimitOrderPrice').value = ".$marketData['bestOtherListing']['price'].";"
		."$('NewLimitOrder').value = 0;"
		."$('LimitOrderBid').value = 0;"
		."$('LimitOrderQuantity').value = $('BuyNowQuantity').value;"
		."$('MarketSubmit').click();"
		."return false;";
	echo $html->link('[Buy for '.$market->commatize($marketData['bestOtherListing']['price']).'g]', '#', array(
		'onclick' => $confirm ? '$(\'BuyNowDiv\').show(); return false;' : $buyNow, 
		'escape' => false));
}
else
{
	$buyNow = ';';
	echo '[no listings]';
}
echo '<span class="Quantity" style="display:none"> x<input id="BuyNowQuantity" style="display:inline; width:20px;" value="1" '.onenter($buyNow).' /></span>';
echo '<div id="BuyNowDiv" style="display:none;"><button onclick="'.$buyNow.'">Confirm</button></div>';
echo '</div>';


$maxNow = $marketData['bestOtherListing'] ? $marketData['bestOtherListing']['quantity'] : 0;
$maxBids = 25;

$ledgerError = '$("BuyQuantityButtons").update("Requires ledger gadget"); return false;';
echo '<div id="BuyQuantityButtons" style="display:'.($hasLedger?'block':'none').';">';
echo $html->link('[-]', '#', array('onclick' => !$hasLedger ? $ledgerError : 
	'$$(".Quantity").each(Element.show);
	$("BuyNowQuantity").value = Math.max(1, parseInt($("BuyNowQuantity").value) - 1); 
	$("BidQuantity").value = Math.max(1, parseInt($("BidQuantity").value)-1);
	return false;'));
echo ' '.$html->link('[+]', '#', array('onclick' => !$hasLedger ? $ledgerError : 
	'$$(".Quantity").each(Element.show);
	$("BuyNowQuantity").value = Math.min('.$maxNow.', parseInt($("BuyNowQuantity").value) + 1); 
	$("BidQuantity").value = Math.min('.$maxBids.', parseInt($("BidQuantity").value)+1);
	return false;'));
echo ' '.$html->link('[max]', '#', array('onclick' => !$hasLedger ? $ledgerError : 
	'$$(".Quantity").each(Element.show);
	$("BuyNowQuantity").value = '.$maxNow.'; 
	$("BidQuantity").value = '.$maxBids.'; 
	return false;'));
echo '</div>';

echo '<div>';
echo '<br>';
$submitBid = "
	$('LimitOrderPrice').value = $('BidPrice').value;
	$('NewLimitOrder').value = 1;
	$('LimitOrderBid').value = 1;
	$('LimitOrderQuantity').value = $('BidQuantity').value;
	$('MarketSubmit').click();
	return false;";
	
echo '<input id="BidPrice" type="text" size="3" value="'.$marketData['bidStart'].'" '.onenter($submitBid).'/>';
echo '<span class="Quantity" style="display:none"> x<input id="BidQuantity" style="display:inline; width:20px;" value="1" '.onenter($submitBid).' /></span> ';
echo $html->link('[Bid]', '#', array('onclick' => $submitBid));
echo '</div>';


echo '</td>';

echo '<td style="vertical-align:bottom">';
echo '<BR>Owned: '.$marketData['owned'];
echo '<BR>Local: '.$marketData['local'];
echo '</td>';
echo '<td style="vertical-align:bottom">';
echo '<BR>Sellable: '.$marketData['sellable'];
echo '<BR>Listed: <span id="ListedCount">'.$marketData['listingCount'].'</span>';
echo '</td>';

echo '</tr>';

if (isset($result['message']))
	echo '<tr><td colspan="4">'.$result['message'].'</td></tr>';

# data row
echo '<tr>';

# LISTINGS
echo "<td valign='top'>";
$table = '<table class="itemview-table">';
$table.= '<tr class="large"><td colspan=3>Listings</td></tr>';
$cells = array();
foreach ($marketData['listings'] as $l)
{
	if ($l['Miner']['id'] == $minerId)
		$action = $ajax->link( '[x]', '/marketables/js_cancel/'.$l['LimitOrder']['id'], array(
			'id' => "Cancel".$l['LimitOrder']['id'],
			'onclick' => '$("Cancel'.$l['LimitOrder']['id'].'").up().up().hide();',
			'complete' => '
				var data = request.responseText.evalJSON();
				if (data.success)
					$("ListedCount").update(parseInt($("ListedCount").innerHTML) - '.$l['LimitOrder']['quantity'].');
				else
					$("Cancel'.$l['LimitOrder']['id'].'").up().up().show();',
			));
	else
		$action = '';

	$cells[] = array (
		$html->link($l['Miner']['name'], '/miners/profile/'.$l['Miner']['name']), 
		array($market->priceQuantity($l['LimitOrder']['price'], $l['LimitOrder']['quantity']), array('style' => 'text-align:right')),
		$action );
}
$table.= $html->tableCells($cells, array('class' => 'odd'), null, false, false);
$table.= "</table>";
echo $table;
echo "</td>";

# BIDS
echo "<td valign='top'>";
$table = '<table class="itemview-table">';
$table.= '<tr class="large"><td colspan=3>Bids</td></tr>';
$cells = array();
foreach ($marketData['bids'] as $b) 
{
	$price = $market->priceQuantity($b['LimitOrder']['price'], $b['LimitOrder']['quantity']);
	if (!$b['hasGold'])
		$price = '<span style="color:red">'.$price.'</span>';

	if ($b['Miner']['id'] == $minerId)
		$action = $ajax->link( '[x]', '/marketables/js_cancel/'.$b['LimitOrder']['id'], array(
			'id' => "Cancel".$b['LimitOrder']['id'],
			'onclick' => '$("Cancel'.$b['LimitOrder']['id'].'").up().up().hide();',
			'complete' => '
				var data = request.responseText.evalJSON();
				if (!data.success)
					$("Cancel'.$b['LimitOrder']['id'].'").up().up().show();',
			));
	else
		$action = '';

	$bidder = $html->link($b['Miner']['name'], '/miners/profile/'.$b['Miner']['name']);
	
	$cells[] = array(
		$bidder, 
		array($price, array('style' => 'text-align:right') ),
		$action );
}
$table.= $html->tableCells($cells, array('class' => 'odd'), null, false, false);
$table.= "</table>";
echo $table;
echo "</td>";

#SALES
echo "<td valign=top>";
$table = '<table class="itemview-table">';
$table.= '<tr class="large"><td colspan=2>Sales</td></tr>';
$cells = array();
foreach ($marketData['sales'] as $sale) {
	$time = date('y/m/d', strtotime($sale['created']));
	$cells[] = array(
		$time,
		$market->priceQuantity($sale['price'], $sale['quantity']));
}
$table.= $html->tableCells($cells, array('class' => 'odd'), null, false, false);
$table.= "</table>";
echo $table;
echo "</td>";

#FOREIGN
if (count($marketData['foreignLimitOrders']))
{
	echo "<td valign=top>";
	$table = '<table class="itemview-table">';
	$table.= '<tr class="large"><td colspan=2>Foreign&nbsp;Spread</td></tr>';
	$cells = array();
	foreach($marketData['foreignLimitOrders'] as $p)
		if (isset($p['bestListing']) or isset($p['bestBid']))
		{
			$bid = isset($p['bestBid']) ? $market->priceQuantity($p['bestBid'], 1) : '[NA]';
			$listing = isset($p['bestListing']) ? $market->priceQuantity($p['bestListing'], 1) : '[NA]';
			
			$cells[] = array(
				$p['cityName'], 
				"$bid&nbsp;-&nbsp;$listing",					
				);
		}
			
	$table.= $html->tableCells(
		$cells, 
		array('class' => 'odd'), 
		null, false, false);
	$table.= "</table>";
	echo $table;	
	echo "</td>";
}
	

echo "</tr>";
echo "</table>";
?>
</div>
