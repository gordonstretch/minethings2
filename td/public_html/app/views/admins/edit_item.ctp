<h1>Edit <? echo $this->data['Item']['name']; ?></h1>
<? echo $html->link('Back to item view', '/items/view/'.$this->data['Item']['id']); ?>
<?php

?><BR><?
echo $html->link('marketable view', '/marketables/market/'.$this->data['Item']['marketable_id']);
?><BR><?

	if (isset($subclassForm))
	{
		echo $form->create('Item', array('url' => 'change_subclass'));
		echo $form->input('id', array('type' => 'hidden'));
		echo "Weapon: ".$form->checkbox('IsaWeapon', array('label' => 'Weapon'))."<br>";
		echo "Land: ".$form->checkbox('IsaLand', array('label' => 'Land'))."<br>";
		echo "Ship: ".$form->checkbox('IsaShip', array('label' => 'Ship'))."<br>";
		echo "Aircraft: ".$form->checkbox('IsaAircraft', array('label' => 'Aircraft'))."<br>";
		echo 'Cannon. '.$form->checkbox('IsaCannon', array('label' => 'Cannon')).'<br>';
		echo 'Cannonball. '.$form->checkbox('IsaCannonball', array('label' => 'Cannonball')).'<br>';
		echo "Equipment: ".$form->checkbox('IsaEquipment')."<br>";
		echo "Explosive: ".$form->checkbox('IsaExplosive')."<BR>";
		echo "Bomb: ".$form->checkbox('IsaBomb')."<BR>";
		echo "Mod: ".$form->checkbox('IsaMod')."<BR>";


		$gadgetOptions = array('' => 'not a gadget');
		foreach($gadgets as $g)
			$gadgetOptions[$g['id']] = $g['name'];

		echo $form->input('GadgetId', array('options' => $gadgetOptions));
		echo $form->end("Change Subtypes");
	}

	echo $form->create('Item', array('url' => 'edit_item'));


	echo $form->input('name');
	echo $form->input('description', array('rows' => '3'));

	
	$options = array();
	foreach($mineTypes as $mineType) 
		$options[$mineType['MineType']['id']] = $mineType['MineType']['name'];	
	$selectParams = array('options' => $options );
	echo $form->input('mine_type_id', $selectParams );
	
	echo $form->input('sort_priority');
	echo $form->input('can_find');
	
	echo $form->input('rarity');
	echo 'Marketable'.$form->checkbox('marketable');

        echo $form->input('id', array('type'=>'hidden')); 
	if (isset($numberOwned))
		echo "Number Owned: ".$numberOwned."<br>";


	if ($this->data['Item']['IsaWeapon'])
	{
		echo $form->input('Weapon.id', array('type' => 'hidden'));
		echo $form->input('Weapon.offense');
		echo $form->input('Weapon.defense');
	}
	if ($this->data['Item']['IsaEquipment'])
	{
		echo $form->input('Equipment.id', array('type' => 'hidden'));
		echo $form->input('Equipment.equipment_type_id');
		echo $form->input('Equipment.buckets_per_hour');
	}
	if ($this->data['Item']['IsaExplosive'])
	{
		echo $form->input('Explosive.id', array('type' => 'hidden'));
		echo $form->input('Explosive.buckets');
	}
	if ($this->data['Item']['IsaCannon'])
	{
		echo $form->input('Cannon.id', array('type' => 'hidden'));
		echo $form->input('Cannon.damage');
		echo $form->input('Cannon.rate_of_fire');
	}
	if ($this->data['Item']['IsaCannonball'])
	{
		echo $form->input('Cannonball.id', array('type' => 'hidden'));
		echo $form->input('Cannonball.type');
	}
	if ($this->data['Item']['IsaBomb'])
	{
		echo $form->input('Bomb.id', array('type' => 'hidden'));
		echo $form->input('Bomb.buckets');
	}
	if ($this->data['Item']['IsaMod'])
	{
		echo $form->input('Mod.id', array('type' => 'hidden'));
		echo $form->input('Mod.capacity');
		echo $form->input('Mod.attack');
		echo $form->input('Mod.armor');
		echo $form->input('Mod.offense');
		echo $form->input('Mod.defense');
		echo $form->input('Mod.dodge');
	}
		

	echo $form->end('Save Item');

	
	if ($this->data['Item']['IsaVehicle'])
		echo "<BR>".$html->link('edit vehicle', '/admins/edit_vehicle/'.$this->data['Vehicle']['id'])."<BR>";

	pr($this->data);

?>
