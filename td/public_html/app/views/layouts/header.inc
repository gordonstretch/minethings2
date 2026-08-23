
	<div id="preloader">
	<?
	echo $html->image('home_h.gif', array('alt' => 'home'));
	echo $html->image('miners_h.gif', array('alt' => 'miners'));
	echo $html->image('mines_h.gif', array('alt' => 'mines'));
	echo $html->image('map_h.gif', array('alt' => 'map'));
	echo $html->image('shop_h.gif', array('alt' => 'shop'));
	echo $html->image('forums_h.gif', array('alt' => 'forums'));
	echo $html->image('facebook_h.gif', array('alt' => 'facebook'));
	echo $html->image('help_h.gif', array('alt' => 'help'));
	?>
	</div>

			
	<div id="wrapper">    
		<? //echo $form->create('Applicant', array('url' => '/applicants/rename', 'id' => 'renameForm')); ?>
	
		<header> 
			<div id="corner-right"></div>    
			<div id="logo"> <!--Logo-->
				<div id="corner-left"></div>
			</div> <!--End Logo -->

	<? if ($loggedIn):?>

			<div id="login"> <!-- Logged In View -->
		
			<div class="logged-in">
				<? 
				if ($unnamed and $canRename)
				{
					echo $form->input('Applicant.name', array(
						'label' => false,
						'placeholder' => 'Choose a Username', 
						'style' => 'width:150px;',
						'div' => array('id' => 'NameDiv', 'class' => 'first', 'style' => 'display:inline'), 
						'onKeydown' => "$('PasswordOneDiv').show(); $('PasswordTwoDiv').show(); $('formBackground').show();",
						'maxlength' => 16));
					echo $form->input('Applicant.password', array(
						'label' => false,
						'placeholder' => 'Choose a Password', 
						'style' => 'width:150px;',
						'type' => 'password', 
						'div' => array('id' => 'PasswordOneDiv', 'style' => 'position:absolute;')));
					echo $form->input('Applicant.password_confirm', array(
						'label' => false,
						'placeholder' => 'Confirm Password', 
						'style' => 'width:150px;',
						'type' => 'password',
						'div' => array('id' => 'PasswordTwoDiv', 'style' => 'position:absolute; margin-top:25px;'), 
						));
					echo '<div class="submit" style="display:inline"><input type="submit" value="Submit" /></div>';
			
					?><script>
					hideInputs = <? echo (!isset($showPasswordFields)) ? 1 : 0; ?>;
					if (hideInputs) {
						$('PasswordOneDiv').hide();
						$('PasswordTwoDiv').hide();
					}
					</script><?
			
				}
				else
					echo '<b>'.$html->link($minerName, '/miners/profile/'.$minerName, array('style' => 'color:white;')).'</b> (<a href="#" style="font-weight:normal;color:white" title="'.$minerMeldCount.' melds">'.$minerMeldCount.'</a>) | '; ?>
				<script language="Javascript">PrintGold(<? echo join(',',array($minerGold, $minerGoldRate, $minerGoldUpdated)); ?>);</script> |
				<? echo '<b><a id="creditsanchor" href="/credits/buy" title="'.$minerCredits.' credits" style="color:white">'.$minerCredits.'c</a></b> | '; ?>
				Batteries: <script language="Javascript">PrintTimer('batteryspan', <? echo $batteryLifeSEC; ?>);</script>
				</div>
				<? if ($showLogout) echo $html->image('button_logout.jpg', array('id' => 'logout', 'alt' => 'logout', 'url' => '/miners/logout')); ?>
		    
			</div> <!-- End Logged In View -->

	<? else: ?>

			<div id="login"> <!-- Login -->
				<? if (isset($loginMessage)) echo '<span style="color:black">'.$loginMessage.'</span>'; ?>
				<span class="register">Not a member? <? echo $html->link('Register!', '/applicants/register'); ?></span> 
		
				<div class="loginContent">
					<?
					echo $form->create('Miner', array('action' => 'login'));
					echo $form->input('name', array('class' => 'field', 'div' => false));
					echo $form->input('password', array('class' => 'field', 'div' => false));
					echo $form->end(array('label' => ' ', 'class' => 'button_login', 'div' => false, ));
					?>
				
				</div>
			
			</div> <!-- End Login -->

	<? endif ?> <!-- if logged in -->

		</header> 

	<? // </form> ?>
	
	<!--Top Navigation-->
	<div id="preloadedImages"></div>

<? if ($tutorialStage): ?>
		<div id="tutorial">

		<span style="float:right">
		<? if ($showSkipLink) echo $html->link('skip tutorial', '/miners/exit_tutorial'); ?>
		</span>

		<b><? echo $tutorialStage['title']; ?></b>
		<? 
		$instructions = $tutorialStage['instructions']; 
		$instructions = preg_replace('/\n/', '</p><p>', $instructions);
		echo '<p>'.$instructions.'</p>';
		?>

		</div>
<? endif; ?>
