<div id="fullcenter">

<div style="float:right">
<?
echo $form->create(NULL, array('action' => 'shop'));
echo $form->input('Coupon.code', array('label' => 'Enter coupon: ', 'div' => false));
echo $form->end(array('label' => 'Apply', 'div' => false));
?>
<div><? if (isset($message)) echo $message; ?></div>
</div>


<p style="text-align:center; font-size:large">
<? echo $html->link("Buy More Credits", '/credits/buy'); ?> 
</p>
<h3>Mine Shop of <? echo $currentCity['name']; ?> </h3>
<? if ($currentCity['hasMarket']): ?>
<p>Here you can purchase or rent additional mines.  While you can have as many mines as you'd like, you can only mine at up to three mines at once.  </p>
<p>Renting will let you use the mine for <? echo $rentalDurationWeeks; ?> weeks.  You can keep whatever you find.</p>
<p><B>Bonus:</B> Purchase or rent any mine using credits and you'll get <? echo $findingFreebies.(($findingFreebies==1)?' finding' : ' findings'); ?> waiting for you at the entrance!
<table><?
echo $html->tableHeaders(array("Mine", "Purchase", "Owned", "Rent", "Rented", "Gold"), null, array('style'=>'text-align:center;') );
$cells = array();
foreach ($mineTypes as $m)
{
	$purchaseForm = $html->link('Buy for '.$m['credit_cost'].' credits', '#', array(
		'onclick' => '$("Buy'.$m['id'].'").toggle(); return false;'));
	$purchaseForm.= '<div id="Buy'.$m['id'].'" style="display:none">';
	$purchaseForm.= $form->create(0, array('action' => 'buy_mine', 'onsubmit' => 'this.buy_submit.disabled = true;'));
	$purchaseForm.= $form->input('Mine.id', array('type' => 'hidden', 'value' => $m['id']));
	$purchaseForm.= $form->end(array('label' => 'Confirm', 'id' => 'buy_submit'));
	$purchaseForm.= '</div>';
	
	$rentForm = $html->link('Rent for '.$m['rent_cost'].' credits', '#', array(
		'onclick' => '$("Rent'.$m['id'].'").toggle(); return false;'));
	$rentForm.= '<div id="Rent'.$m['id'].'" style="display:none">';
	$rentForm.= $form->create(0, array('action' => 'rent_mine', 'onsubmit' => 'this.rent_submit.disabled = true;'));
	$rentForm.= $form->input('Mine.id', array('type' => 'hidden', 'value' => $m['id']));
	$rentForm.= $form->end(array('label' => 'Confirm', 'id' => 'rent_submit'));
	$rentForm.= '</div>';

	$spread = $market->spread($m['spread']);
	if (!$spread)
		$spread = $m['name'].' Market';
	$marketLink = $html->link($spread, '/marketables/market/'.$m['marketable_id']);
	
	$elements = array($html->image('icons/M'.$m['id'].'L6.png').' '.$m['name'], $purchaseForm, $m['owned'], $rentForm, $m['rented'], $marketLink);
	$cells[] = $elements;
}
echo $html->tableCells($cells);
?>
</table>
<BR>
<? echo $html->link('all mine markets', '/mine_types/all_markets');?>
<p style="text-align:center; font-size:large">
<? echo $html->link("Buy More Credits", '/credits/buy'); ?> 
</p>
<? endif; ?>
</table>

<br>
<h3>Inventory Containers</h3>
<p>Permanently boost your inventory limit by purchasing inventory containers.  Each type of container you own will boost your limit by the amount shown.  Owning more than one of a type will not help you but you can sell extras for gold.  </p>
<p>Other ways to increase your inventory limit are to make an avatar (25+), or use the warehouse gadget (+125).  The maximum inventory limit is <? echo $maxInventory; ?> (<? echo $maxInventory+$warehouseBonus+$avatarBonus+25; ?> with warehouse and avatar).  </p>
<p>Your <b>current inventory limit</b> is <span id="ItemLimit" style="display:inline"><? echo $inventoryLimit; ?></span>.</p>

<div id="ContainerError"></div>

<table>
<?
echo $html->tableHeaders(array("Name", "Capacity", "Buy", "Owned", "Gold Purchase", "Gld/Cdt"), null, array('style' => 'text-align:center;'));
foreach($containers as $c)
{
	$buyButton = $html->link("Buy for ".$c['credits']." credits", '#', array(
		'onclick' => '$("BuyContainer'.$c['id'].'").toggle(); return false;'));
	$buyButton.= '<div id="BuyContainer'.$c['id'].'" style="display:none">';
	$buyButton.= $ajax->form('js_buy_container', 'post', array(
		'update' => array('Owned'.$c['id'], 'ContainerError', 'ItemLimit'),
		'before' => '$("BuyContainer'.$c['id'].'").hide();',
		'indicator' => 'LoadingDiv',
		));
	$buyButton.= $form->input('Container.id', array('type' => 'hidden', 'value' => $c['id']));	
	$buyButton.= $form->end(
		array('label' => 'Confirm',
			'id' => 'Buy'.$c['id']));
	$buyButton.= '</div>';
			
	$owned = '<div id="Owned'.$c['id'].'">'.$c['owned'].'</div>';
	$spread = $market->spread($c['spread']);
	if (!$spread)
		$spread = $c['name'].' Market';
	$marketLink = $html->link($spread, '/marketables/market/'.$c['marketableId']);
	
	if ($c['bestGpc'])
		$c['gpc'] = "<B>$c[gpc]</B>";
	echo $html->tableCells(array($c['name'], $c['capacity'], $buyButton, $owned, $marketLink, $c['gpc']));	
}
?>
</table>


<p style="text-align:center; font-size:large">
<? echo $html->link("Buy More Credits", '/credits/buy'); ?> 
</p>


<h3>Battery Extension</h3>
<b>Important</b>: This purchase is not required!  You can always recharge your battery for free by clicking 'Mines'.<BR>
<p>Do you find yourself concerned about when your batteries might run out next?  Give our ten-day batteries a try.  Each one will give you a one-time extension on your battery life by ten days.  </p>
<p>Going on vacation for a month?  Buy three!  Each one adds ten days and there's no limit to the number you can buy.</p>
<table>
<?
echo $html->tableHeaders(array("Description", "Cost", ""));
$formText = $form->create(null, array('action' => 'battery_extension'));
$formText.= $form->input('Battery.days', array('type' => 'hidden', 'value' => 10));
$formText.= $form->end("Buy");
echo $html->tableCells(array(array("+10d Battery Life", $creditCosts['+10d battery']." credits", $formText)));
?>
</table>

<p style="text-align:center; font-size:large">
<? echo $html->link("Buy More Credits", '/credits/buy'); ?> 
</p>


</div>
