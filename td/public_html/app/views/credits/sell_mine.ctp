<div id="fullcenter">

<h2>Sell Mine</h2>
<?
echo $form->create('', array('action' => 'sell_mine/'.$mineTypeId));
echo $form->input('MineType.id', array('type' => 'hidden', 'value' => $mineTypeId));
echo $form->end(array(
	'label' => "Sell $mineTypeName for $refund credits",
	'id' => 'SellButton', 
	'onclick' => "submit(); $('SellButton').disabled = true; return false;"));
if (isset($message))
	echo $message;
?>

</div>